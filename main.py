
import asyncio
import json
import math
import os
import secrets
import tempfile
import time
import wave
import re
import logging
from dataclasses import dataclass
from threading import Lock
from pathlib import Path

from fastapi import (
    FastAPI,
    File,
    Form,
    HTTPException,
    UploadFile,
    WebSocket,
    WebSocketDisconnect,
)
from fastapi.middleware.cors import CORSMiddleware
from starlette.concurrency import run_in_threadpool
from faster_whisper import WhisperModel
import av
_original_av_open = av.open
def _patched_av_open(*args, **kwargs):
    kwargs.pop("metadata_errors", None)
    return _original_av_open(*args, **kwargs)
av.open = _patched_av_open
import numpy as np

# --------------------------------------------------
# FFmpeg setup
# --------------------------------------------------

ffmpeg_path = (
    Path.home()
    / "AppData"
    / "Local"
    / "Microsoft"
    / "WinGet"
    / "Packages"
    / "Gyan.FFmpeg.Shared_Microsoft.Winget.Source_8wekyb3d8bbwe"
    / "ffmpeg-9.0.2-full_build-shared"
    / "bin"
)

if ffmpeg_path.exists():
    os.environ["PATH"] = (
        str(ffmpeg_path) + os.pathsep + os.environ.get("PATH", "")
    )

# --------------------------------------------------
# FastAPI setup
# --------------------------------------------------

app = FastAPI(title="CyberMitra API")
logger = logging.getLogger("uvicorn.error")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

whisper_model = None
emotion_classifier = None
live_rooms = {}
available_investigators = {}
investigator_sessions = set()
live_call_requests = {}
live_call_by_socket = {}
signaling_tickets = {}
CALL_REQUEST_TIMEOUT_SECONDS = 45
LIVE_SAMPLE_RATE = 16000
LIVE_MAX_WINDOW_SECONDS = 15
LIVE_PCM_CHANNELS = 1
LIVE_PCM_SAMPLE_WIDTH = 2
EMOTION_MODEL_ID = "Dpngtm/wav2vec2-emotion-recognition"
EMOTION_MODEL_REVISION = "033a5751a5bbe5b0b67c2c71e6102c38de35a346"
EMOTION_SAMPLE_RATE = 16000
EMOTION_CHUNK_SECONDS = 8
EMOTION_MIN_CHUNK_SECONDS = 0.5
EMOTION_BATCH_SIZE = 4
EMOTION_ANALYSIS_BUDGET_SECONDS = 300
MAX_EMOTION_SEGMENTS = 3000
MAX_EMOTION_RECORDING_SECONDS = 3600
analysis_lock = Lock()


@dataclass
class EmotionClassifier:
    model: object
    processor: object
    labels: dict


def get_whisper_model():
    global whisper_model

    if whisper_model is None:
        whisper_model = WhisperModel(
            "small",
            device="cpu",
            compute_type="int8",
        )

    return whisper_model


def get_emotion_classifier():
    global emotion_classifier

    if emotion_classifier is None:
        os.environ.setdefault("HF_HUB_ETAG_TIMEOUT", "20")
        os.environ.setdefault("HF_HUB_DOWNLOAD_TIMEOUT", "60")
        from transformers import AutoModelForAudioClassification, AutoProcessor

        processor = AutoProcessor.from_pretrained(
            EMOTION_MODEL_ID,
            revision=EMOTION_MODEL_REVISION,
        )
        model = AutoModelForAudioClassification.from_pretrained(
            EMOTION_MODEL_ID,
            revision=EMOTION_MODEL_REVISION,
        )
        model.to("cpu")
        model.eval()
        labels = {
            int(index): str(label)
            for index, label in model.config.id2label.items()
        }
        if not labels or any(label.startswith("LABEL_") for label in labels.values()):
            raise ValueError("Emotion model configuration has no usable class labels.")
        emotion_classifier = EmotionClassifier(model, processor, labels)

    return emotion_classifier


def _decode_audio_for_transcription(temp_path, sampling_rate=16000):
    resampler = av.audio.resampler.AudioResampler(
        format="s16",
        layout="mono",
        rate=sampling_rate,
    )
    decoded_frames = []

    with av.open(temp_path, mode="r") as container:
        for frame in container.decode(audio=0):
            decoded_frames.extend(
                resampled_frame.to_ndarray()
                for resampled_frame in resampler.resample(frame)
            )
        decoded_frames.extend(
            resampled_frame.to_ndarray()
            for resampled_frame in resampler.resample(None)
        )

    if not decoded_frames:
        return np.empty(0, dtype=np.float32)

    audio = np.concatenate(decoded_frames, axis=1)
    return audio.reshape(-1).astype(np.float32) / 32768.0


def _emotion_error(error, analyzed_duration=0.0):
    return {
        "status": "failed",
        "model": EMOTION_MODEL_ID,
        "model_revision": EMOTION_MODEL_REVISION,
        "label": None,
        "confidence": None,
        "analyzed_duration": round(analyzed_duration, 2),
        "segments_analyzed": 0,
        "total_segments": 0,
        "segments": [],
        "error": str(error),
    }


def _speech_audio_chunks(audio, segments, sampling_rate=EMOTION_SAMPLE_RATE):
    max_chunk_samples = sampling_rate * EMOTION_CHUNK_SECONDS
    previous_end = 0

    for segment in sorted(segments, key=lambda item: item["start"]):
        start = max(0, int(float(segment["start"]) * sampling_rate), previous_end)
        end = min(len(audio), int(float(segment["end"]) * sampling_rate))
        previous_end = max(previous_end, end)

        if end <= start:
            continue

        while start < end:
            chunk_end = min(start + max_chunk_samples, end)
            yield (
                start / sampling_rate,
                chunk_end / sampling_rate,
                audio[start:chunk_end],
            )
            start = chunk_end


def _predict_emotion_batch(classifier, audio_chunks):
    import torch

    processor_inputs = classifier.processor(
        [chunk.astype(np.float32, copy=False) for chunk in audio_chunks],
        sampling_rate=EMOTION_SAMPLE_RATE,
        padding=True,
        return_tensors="pt",
    )
    model_inputs = {
        name: value.to("cpu") if hasattr(value, "to") else value
        for name, value in processor_inputs.items()
    }
    with torch.inference_mode():
        logits = classifier.model(**model_inputs).logits
        scores = torch.softmax(logits, dim=-1).cpu().tolist()

    if len(scores) != len(audio_chunks):
        raise ValueError("Emotion model returned an invalid prediction batch.")

    if len(scores) != len(audio_chunks):
        raise ValueError("Emotion model returned an invalid prediction batch.")

    predictions = []
    for chunk_scores in scores:
        if len(chunk_scores) != len(classifier.labels):
            raise ValueError("Emotion model returned an invalid class-score vector.")
        predictions.append({
            classifier.labels[index]: float(score)
            for index, score in enumerate(chunk_scores)
            if index in classifier.labels and math.isfinite(float(score))
        })
    return predictions


def _failed_emotion_chunk(start, end, error, status="failed"):
    return {
        "start": round(start, 2),
        "end": round(end, 2),
        "status": status,
        "label": None,
        "confidence": None,
        "error": str(error),
    }


def _analyze_emotion(audio, segments, filename="recording"):
    chunks = []
    results = []
    minimum_chunk_samples = int(
        EMOTION_SAMPLE_RATE * EMOTION_MIN_CHUNK_SECONDS
    )

    for start, end, chunk in _speech_audio_chunks(audio, segments):
        if len(chunk) < minimum_chunk_samples:
            results.append(_failed_emotion_chunk(
                start,
                end,
                "Speech interval is shorter than the model's 0.5-second minimum.",
                "skipped",
            ))
        elif not np.isfinite(chunk).all() or float(np.sqrt(np.mean(chunk ** 2))) < 0.0005:
            results.append(_failed_emotion_chunk(
                start,
                end,
                "No audible speech energy was detected in this interval.",
                "skipped",
            ))
        else:
            chunks.append((start, end, chunk))

    if not chunks:
        error = "No audible speech intervals long enough for emotion analysis were found."
        return {
            "status": "failed",
            "model": EMOTION_MODEL_ID,
            "model_revision": EMOTION_MODEL_REVISION,
            "label": None,
            "confidence": None,
            "analyzed_duration": 0.0,
            "segments_analyzed": 0,
            "total_segments": len(results),
            "segments": results,
            "error": error,
        }

    try:
        classifier = get_emotion_classifier()
    except Exception as error:
        logger.exception("Voice emotion model unavailable (filename=%s)", filename)
        results.extend(
            _failed_emotion_chunk(start, end, error)
            for start, end, _ in chunks
        )
        return {
            "status": "failed",
            "model": EMOTION_MODEL_ID,
            "model_revision": EMOTION_MODEL_REVISION,
            "label": None,
            "confidence": None,
            "analyzed_duration": 0.0,
            "segments_analyzed": 0,
            "total_segments": len(results),
            "segments": sorted(results, key=lambda item: item["start"]),
            "error": str(error),
        }

    started_at = time.monotonic()
    weighted_scores = {}
    analyzed_duration = 0.0

    for offset in range(0, len(chunks), EMOTION_BATCH_SIZE):
        batch = chunks[offset:offset + EMOTION_BATCH_SIZE]
        if time.monotonic() - started_at >= EMOTION_ANALYSIS_BUDGET_SECONDS:
            results.extend(
                _failed_emotion_chunk(
                    start,
                    end,
                    "Emotion analysis time budget reached; this interval was not analyzed.",
                    "skipped",
                )
                for start, end, _ in chunks[offset:]
            )
            break

        try:
            batch_scores = _predict_emotion_batch(
                classifier,
                [chunk for _, _, chunk in batch],
            )
        except Exception as batch_error:
            logger.exception(
                "Voice emotion batch failed (filename=%s, batch=%s)",
                filename,
                offset // EMOTION_BATCH_SIZE,
            )
            for start, end, chunk in batch:
                try:
                    scores = _predict_emotion_batch(classifier, [chunk])[0]
                    _record_emotion_scores(
                        results, weighted_scores, start, end, scores
                    )
                    analyzed_duration += (end - start)
                except Exception as error:
                    logger.exception(
                        "Voice emotion chunk failed (filename=%s, start=%.2f, end=%.2f)",
                        filename,
                        start,
                        end,
                    )
                    results.append(_failed_emotion_chunk(
                        start,
                        end,
                        error or batch_error,
                    ))
            continue

        for (start, end, _), scores in zip(batch, batch_scores):
            try:
                _record_emotion_scores(
                    results, weighted_scores, start, end, scores
                )
                analyzed_duration += (end - start)
            except Exception as error:
                logger.exception(
                    "Voice emotion prediction invalid (filename=%s, start=%.2f, end=%.2f)",
                    filename,
                    start,
                    end,
                )
                results.append(_failed_emotion_chunk(start, end, error))

    successful = [item for item in results if item["status"] == "completed"]
    if successful and weighted_scores and analyzed_duration > 0:
        label = max(weighted_scores, key=weighted_scores.get)
        confidence = weighted_scores[label] / analyzed_duration
    else:
        label = None
        confidence = None

    all_complete = len(successful) == len(results) and bool(successful)
    status = "completed" if all_complete else "partial" if successful else "failed"
    errors = list(dict.fromkeys(
        item["error"] for item in results if item["error"]
    ))
    return {
        "status": status,
        "model": EMOTION_MODEL_ID,
        "model_revision": EMOTION_MODEL_REVISION,
        "label": label,
        "confidence": round(confidence, 4) if confidence is not None else None,
        "analyzed_duration": round(analyzed_duration, 2),
        "segments_analyzed": len(successful),
        "total_segments": len(results),
        "segments": sorted(results, key=lambda item: item["start"]),
        "error": "; ".join(errors) if errors else None,
    }


def _record_emotion_scores(results, weighted_scores, start, end, scores):
    valid_scores = {
        label: float(score)
        for label, score in scores.items()
        if isinstance(label, str)
        and isinstance(score, (float, int))
        and math.isfinite(float(score))
        and 0 <= float(score) <= 1
    }
    if not valid_scores:
        raise ValueError("Emotion model returned no valid class scores.")

    label = max(valid_scores, key=valid_scores.get)
    duration = end - start
    for emotion_label, score in valid_scores.items():
        weighted_scores[emotion_label] = (
            weighted_scores.get(emotion_label, 0.0) + score * duration
        )
    results.append({
        "start": round(start, 2),
        "end": round(end, 2),
        "status": "completed",
        "label": label,
        "confidence": round(valid_scores[label], 4),
        "error": None,
    })


def _analyze_audio_file(temp_path, filename, language):
    language_map = {
        "auto": None,
        "hindi": "hi",
        "hi": "hi",
        "english": "en",
        "en": "en",
    }
    audio = _decode_audio_for_transcription(temp_path)
    model = get_whisper_model()

    segments_generator, info = model.transcribe(
        audio,
        language=language_map[language],
        beam_size=5,
        vad_filter=True,
        condition_on_previous_text=False,
    )

    segments = []
    transcript_parts = []

    for segment in segments_generator:
        text = segment.text.strip()

        if text:
            segments.append({
                "start": round(segment.start, 2),
                "end": round(segment.end, 2),
                "text": text,
            })
            transcript_parts.append(text)

    transcript = " ".join(transcript_parts).strip()
    emotion = _analyze_emotion(audio, segments, filename)

    return {
        "filename": filename,
        "language": info.language,
        "language_probability": round(
            float(info.language_probability), 4
        ),
        "duration": round(float(info.duration), 2),
        "segments": segments,
        "transcript": transcript,
        "emotion": emotion,
    }


def analyze_emotion_file(temp_path, segments, filename):
    with analysis_lock:
        audio = _decode_audio_for_transcription(temp_path)
        return _analyze_emotion(audio, segments, filename)


def analyze_audio_file(temp_path, filename, language):
    with analysis_lock:
        return _analyze_audio_file(temp_path, filename, language)


def _write_live_pcm_wav(temp_path, pcm_bytes):
    if not pcm_bytes or len(pcm_bytes) % LIVE_PCM_SAMPLE_WIDTH:
        raise ValueError("Live PCM must contain complete signed 16-bit samples.")

    pcm_samples = np.frombuffer(pcm_bytes, dtype="<i2")
    pcm_float = pcm_samples.astype(np.float32) / 32768.0
    with wave.open(temp_path, "wb") as wav_file:
        wav_file.setnchannels(LIVE_PCM_CHANNELS)
        wav_file.setsampwidth(LIVE_PCM_SAMPLE_WIDTH)
        wav_file.setframerate(LIVE_SAMPLE_RATE)
        wav_file.writeframes(pcm_bytes)

    with wave.open(temp_path, "rb") as wav_file:
        wav_metadata = {
            "channels": wav_file.getnchannels(),
            "sample_width": wav_file.getsampwidth(),
            "sample_rate": wav_file.getframerate(),
            "frames": wav_file.getnframes(),
        }
    if (
        wav_metadata["channels"] != LIVE_PCM_CHANNELS
        or wav_metadata["sample_width"] != LIVE_PCM_SAMPLE_WIDTH
        or wav_metadata["sample_rate"] != LIVE_SAMPLE_RATE
        or wav_metadata["frames"] != pcm_samples.size
    ):
        raise ValueError("Live PCM did not round-trip to the expected WAV format.")

    return {
        **wav_metadata,
        "peak": int(np.max(np.abs(pcm_samples))) if pcm_samples.size else 0,
        "rms": float(np.sqrt(np.mean(np.square(pcm_float)))) if pcm_float.size else 0.0,
    }


# --------------------------------------------------
# Basic routes
# --------------------------------------------------

@app.get("/")
def home():
    return {"message": "CyberMitra API is running"}


@app.get("/health")
def health():
    return {
        "status": "healthy",
        "transcription_model": "small",
        "language_support": [
            "Hindi",
            "Hinglish",
            "English",
        ],
    }


# --------------------------------------------------
# Transcription
# --------------------------------------------------

@app.post("/transcribe")
async def transcribe_audio(
    file: UploadFile = File(...),
    language: str = Form("auto"),
):
    allowed_extensions = {
        ".wav", ".mp3", ".m4a", ".mp4",
        ".webm", ".ogg", ".flac", ".mpeg", ".mpga", ".aac",
    }

    filename = file.filename or "recording.wav"
    extension = Path(filename).suffix.lower()

    if extension not in allowed_extensions:
        raise HTTPException(
            status_code=400,
            detail="Unsupported audio format.",
        )

    # auto: let Whisper detect the language.
    # hi: Hindi-language hint; can also work with some Hinglish speech.
    # en: English-language hint.
    language = language.strip().lower()

    language_map = {
        "auto": None,
        "hindi": "hi",
        "hi": "hi",
        "english": "en",
        "en": "en",
    }

    if language not in language_map:
        raise HTTPException(
            status_code=400,
            detail="Choose auto, Hindi, or English.",
        )

    temp_path = None

    try:
        audio_bytes = await file.read()

        if not audio_bytes:
            raise HTTPException(
                status_code=400,
                detail="The uploaded audio file is empty.",
            )

        if len(audio_bytes) > 100 * 1024 * 1024:
            raise HTTPException(
                status_code=413,
                detail="Audio file exceeds the 100 MB limit.",
            )

        with tempfile.NamedTemporaryFile(
            delete=False,
            suffix=extension,
        ) as temp_file:
            temp_file.write(audio_bytes)
            temp_path = temp_file.name

        return await run_in_threadpool(
            analyze_audio_file,
            temp_path,
            filename,
            language,
        )

    except HTTPException:
        raise

    except Exception as error:
        logger.exception("Audio processing failed (filename=%s)", filename)
        raise HTTPException(
            status_code=500,
            detail=f"Audio processing failed: {str(error)}",
        ) from error

    finally:
        if temp_path and os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except OSError:
                pass

        await file.close()


@app.post("/analyze-emotion")
async def analyze_emotion_audio(
    file: UploadFile = File(...),
    segments: str = Form("[]"),
):
    allowed_extensions = {
        ".wav", ".mp3", ".m4a", ".mp4",
        ".webm", ".ogg", ".flac", ".mpeg", ".mpga", ".aac",
    }
    filename = file.filename or "recording.wav"
    extension = Path(filename).suffix.lower()

    if extension not in allowed_extensions:
        raise HTTPException(status_code=400, detail="Unsupported audio format.")

    try:
        speech_segments = json.loads(segments)
    except json.JSONDecodeError as error:
        raise HTTPException(
            status_code=400,
            detail="Transcript segments must be valid JSON.",
        ) from error

    if not isinstance(speech_segments, list):
        raise HTTPException(
            status_code=400,
            detail="Transcript segments must be a JSON list.",
        )
    if len(speech_segments) > MAX_EMOTION_SEGMENTS:
        raise HTTPException(
            status_code=413,
            detail=f"At most {MAX_EMOTION_SEGMENTS} transcript segments can be analyzed.",
        )

    for segment in speech_segments:
        if (
            not isinstance(segment, dict)
            or not isinstance(segment.get("start"), (int, float))
            or not isinstance(segment.get("end"), (int, float))
            or isinstance(segment.get("start"), bool)
            or isinstance(segment.get("end"), bool)
            or not math.isfinite(float(segment["start"]))
            or not math.isfinite(float(segment["end"]))
            or float(segment["start"]) < 0
            or float(segment["end"]) <= float(segment["start"])
            or float(segment["end"]) > MAX_EMOTION_RECORDING_SECONDS
        ):
            raise HTTPException(
                status_code=400,
                detail="Each transcript segment must include finite start and end times.",
            )

    temp_path = None
    try:
        audio_bytes = await file.read()
        if not audio_bytes:
            raise HTTPException(
                status_code=400,
                detail="The uploaded audio file is empty.",
            )
        if len(audio_bytes) > 100 * 1024 * 1024:
            raise HTTPException(
                status_code=413,
                detail="Audio file exceeds the 100 MB limit.",
            )

        with tempfile.NamedTemporaryFile(
            delete=False,
            suffix=extension,
        ) as temp_file:
            temp_file.write(audio_bytes)
            temp_path = temp_file.name

        try:
            emotion = await run_in_threadpool(
                analyze_emotion_file,
                temp_path,
                speech_segments,
                filename,
            )
        except Exception as error:
            logger.exception("Voice emotion audio decoding failed (filename=%s)", filename)
            emotion = _emotion_error(error)
        return {"emotion": emotion}

    finally:
        if temp_path and os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except OSError:
                logger.exception("Unable to remove temporary emotion audio file.")
        await file.close()


async def _send_live_call_event(websocket, message):
    if websocket is None:
        return
    try:
        await websocket.send_json(message)
    except (WebSocketDisconnect, RuntimeError):
        logger.warning("Live call participant disconnected before notification.")


async def _finish_live_call(
    call,
    caller_event,
    investigator_event,
    restore_investigator=True,
):
    request_id = call["request_id"]
    if live_call_requests.get(request_id) is not call:
        return

    del live_call_requests[request_id]
    caller_socket = call["caller"]
    investigator_socket = call["investigator"]
    live_call_by_socket.pop(caller_socket, None)
    live_call_by_socket.pop(investigator_socket, None)
    for ticket, authorization in tuple(signaling_tickets.items()):
        if authorization[0] is call:
            del signaling_tickets[ticket]

    if call.get("room"):
        live_rooms.pop(call["room"], None)

    await _send_live_call_event(caller_socket, caller_event)
    await _send_live_call_event(investigator_socket, investigator_event)

    if (
        restore_investigator
        and investigator_socket in investigator_sessions
        and investigator_socket.application_state.name == "CONNECTED"
    ):
        available_investigators[investigator_socket] = True
        await _send_live_call_event(investigator_socket, {"type": "available"})


@app.websocket("/ws/live-calls")
async def live_call_socket(websocket: WebSocket, role: str):
    if role not in {"caller", "investigator"}:
        await websocket.close(code=4400, reason="Invalid call role.")
        return

    await websocket.accept()
    logger.info("Live call control connected (role=%s)", role)
    call = None

    if role == "investigator":
        if websocket in investigator_sessions:
            await websocket.close(code=4409, reason="Investigator session already active.")
            return
        investigator_sessions.add(websocket)
        available_investigators[websocket] = True
        await _send_live_call_event(websocket, {"type": "available"})

    try:
        while True:
            timeout = (
                CALL_REQUEST_TIMEOUT_SECONDS
                if (
                    role == "caller"
                    and call
                    and (
                        call["state"] == "pending"
                        or (
                            call["state"] == "accepted"
                            and len(call["signal_roles"]) < 2
                        )
                    )
                )
                else None
            )
            try:
                message = await asyncio.wait_for(
                    websocket.receive_json(),
                    timeout=timeout,
                )
            except asyncio.TimeoutError:
                if call and (
                    call["state"] == "pending"
                    or (
                        call["state"] == "accepted"
                        and len(call["signal_roles"]) < 2
                    )
                ):
                    timeout_event = (
                        {"type": "timeout", "message": "No investigator accepted the call in time."}
                        if call["state"] == "pending"
                        else {"type": "ended", "message": "The call connection timed out."}
                    )
                    await _finish_live_call(
                        call,
                        timeout_event,
                        {"type": "call_cancelled", "request_id": call["request_id"]},
                    )
                    call = None
                continue

            message_type = message.get("type")
            if role == "caller" and message_type == "request":
                if call is not None:
                    await _send_live_call_event(websocket, {
                        "type": "error",
                        "message": "A call request is already active.",
                    })
                    continue
                investigator_socket = next(
                    (
                        candidate
                        for candidate in available_investigators
                        if candidate.application_state.name == "CONNECTED"
                    ),
                    None,
                )
                if investigator_socket is None:
                    await _send_live_call_event(websocket, {"type": "unavailable"})
                    continue

                request_id = secrets.token_hex(16)
                call = {
                    "request_id": request_id,
                    "caller": websocket,
                    "investigator": investigator_socket,
                    "state": "pending",
                    "room": None,
                    "signal_roles": set(),
                }
                available_investigators.pop(investigator_socket, None)
                live_call_requests[request_id] = call
                live_call_by_socket[websocket] = call
                live_call_by_socket[investigator_socket] = call
                await _send_live_call_event(websocket, {"type": "waiting"})
                await _send_live_call_event(investigator_socket, {
                    "type": "incoming_call",
                    "request_id": request_id,
                })
            elif role == "caller" and message_type in {"cancel", "end"}:
                if call:
                    pending = call["state"] == "pending"
                    await _finish_live_call(
                        call,
                        {"type": "ended"},
                        {
                            "type": "call_cancelled" if pending else "call_ended",
                            "request_id": call["request_id"],
                        },
                    )
                    call = None
                if message_type == "cancel":
                    await _send_live_call_event(websocket, {"type": "cancelled"})
            elif role == "investigator" and message_type in {"accept", "decline"}:
                request_id = message.get("request_id")
                pending_call = live_call_requests.get(request_id)
                if (
                    not pending_call
                    or pending_call["investigator"] is not websocket
                    or pending_call["state"] != "pending"
                ):
                    await _send_live_call_event(websocket, {
                        "type": "error",
                        "message": "That incoming call is no longer available.",
                    })
                    continue

                if message_type == "decline":
                    await _finish_live_call(
                        pending_call,
                        {"type": "declined"},
                        {"type": "call_declined"},
                    )
                    continue

                room = secrets.token_hex(16)
                caller_ticket = secrets.token_hex(24)
                investigator_ticket = secrets.token_hex(24)
                pending_call.update(state="accepted", room=room)
                signaling_tickets[caller_ticket] = (
                    pending_call,
                    "caller",
                    pending_call["caller"],
                )
                signaling_tickets[investigator_ticket] = (
                    pending_call,
                    "investigator",
                    websocket,
                )
                await _send_live_call_event(pending_call["caller"], {
                    "type": "accepted",
                    "room": room,
                    "ticket": caller_ticket,
                })
                await _send_live_call_event(websocket, {
                    "type": "accepted",
                    "request_id": request_id,
                    "room": room,
                    "ticket": investigator_ticket,
                })
            elif role == "investigator" and message_type in {"end", "offline"}:
                active_call = live_call_by_socket.get(websocket)
                if active_call:
                    event_type = "unavailable" if message_type == "offline" else "ended"
                    await _finish_live_call(
                        active_call,
                        {"type": event_type},
                        {"type": "call_ended"},
                        restore_investigator=message_type != "offline",
                    )
                if message_type == "offline":
                    available_investigators.pop(websocket, None)
                    investigator_sessions.discard(websocket)
                    await _send_live_call_event(websocket, {"type": "offline"})
            else:
                await _send_live_call_event(websocket, {
                    "type": "error",
                    "message": "Unsupported live call request.",
                })
    except WebSocketDisconnect as error:
        logger.info("Live call control disconnected (role=%s code=%s)", role, error.code)
    except Exception:
        logger.exception("Live call control failed (role=%s)", role)
        raise
    finally:
        available_investigators.pop(websocket, None)
        investigator_sessions.discard(websocket)
        active_call = live_call_by_socket.get(websocket)
        if active_call:
            if role == "investigator":
                caller_event = (
                    {"type": "unavailable"}
                    if active_call["state"] == "pending"
                    else {"type": "ended"}
                )
                await _finish_live_call(
                    active_call,
                    caller_event,
                    {"type": "offline"},
                    restore_investigator=False,
                )
            else:
                await _finish_live_call(
                    active_call,
                    {"type": "ended"},
                    {
                        "type": "call_cancelled" if active_call["state"] == "pending" else "call_ended",
                        "request_id": active_call["request_id"],
                    },
                )


@app.websocket("/ws/signaling/{room}")
async def signaling_socket(websocket: WebSocket, room: str, role: str, ticket: str = ""):
    if (
        not re.fullmatch(r"[A-Za-z0-9-]{4,64}", room)
        or role not in {"caller", "investigator"}
    ):
        logger.warning(
            "Signaling rejected: invalid room or role (room=%s role=%s)",
            room,
            role,
        )
        await websocket.close(code=4400, reason="Invalid room or role.")
        return

    authorization = signaling_tickets.get(ticket)
    if (
        not authorization
        or authorization[0].get("room") != room
        or authorization[1] != role
        or authorization[2].application_state.name != "CONNECTED"
        or authorization[0]["state"] != "accepted"
    ):
        await websocket.close(code=4401, reason="Call was not accepted or this session is not authorized.")
        return
    del signaling_tickets[ticket]
    authorization[0]["signal_roles"].add(role)

    await websocket.accept()
    logger.info("Signaling WebSocket accepted (room=%s role=%s)", room, role)
    peers = live_rooms.setdefault(room, {})

    if role in peers:
        logger.warning(
            "Signaling rejected: role already joined (room=%s role=%s)",
            room,
            role,
        )
        await websocket.close(code=4409, reason="That role is already in this room.")
        return

    other_role = "investigator" if role == "caller" else "caller"
    peer = peers.get(other_role)
    peers[role] = websocket
    logger.info(
        "Signaling room membership updated (room=%s role=%s peer_connected=%s)",
        room,
        role,
        peer is not None,
    )

    try:
        await websocket.send_json({
            "type": "joined",
            "role": role,
            "peer_connected": peer is not None,
        })
        if peer:
            await peer.send_json({"type": "peer_joined", "role": role})

        while True:
            message = await websocket.receive_json()
            message_type = message.get("type")
            logger.info(
                "Signaling message received (room=%s role=%s type=%s)",
                room,
                role,
                message_type,
            )
            if message_type not in {"offer", "answer", "candidate"}:
                await websocket.send_json({
                    "type": "error",
                    "message": "Unsupported signaling message.",
                })
                continue

            peer = live_rooms.get(room, {}).get(other_role)
            if peer:
                await peer.send_json(message)
                logger.info(
                    "Signaling message forwarded (room=%s from=%s to=%s type=%s)",
                    room,
                    role,
                    other_role,
                    message_type,
                )
            else:
                logger.warning(
                    "Signaling message has no peer (room=%s role=%s type=%s)",
                    room,
                    role,
                    message_type,
                )
                await websocket.send_json({
                    "type": "error",
                    "message": "The other participant is not connected.",
                })
    except WebSocketDisconnect as error:
        logger.info(
            "Signaling WebSocket disconnected (room=%s role=%s code=%s)",
            room,
            role,
            error.code,
        )
    except Exception:
        logger.exception(
            "Signaling WebSocket failed (room=%s role=%s)",
            room,
            role,
        )
        raise
    finally:
        peers = live_rooms.get(room, {})
        if peers.get(role) is websocket:
            del peers[role]
            peer = peers.get(other_role)
            logger.info(
                "Signaling room membership removed (room=%s role=%s remaining=%s)",
                room,
                role,
                list(peers),
            )
            if peer:
                try:
                    await peer.send_json({"type": "peer_left", "role": role})
                except Exception:
                    logger.exception(
                        "Failed to notify signaling peer (room=%s role=%s)",
                        room,
                        other_role,
                    )
        if not peers:
            live_rooms.pop(room, None)
            logger.info("Signaling room removed (room=%s)", room)


@app.websocket("/ws/live-audio/{room}")
async def live_audio_socket(websocket: WebSocket, room: str):
    if not re.fullmatch(r"[A-Za-z0-9-]{4,64}", room):
        logger.warning("Live audio rejected: invalid room (room=%s)", room)
        await websocket.close(code=4400, reason="Invalid room.")
        return

    peers = live_rooms.get(room, {})
    if "caller" not in peers or "investigator" not in peers:
        logger.warning(
            "Live audio rejected: participants missing (room=%s roles=%s)",
            room,
            list(peers),
        )
        await websocket.close(code=4401, reason="Both participants must join before audio analysis.")
        return

    await websocket.accept()
    logger.info("Live audio WebSocket accepted (room=%s)", room)
    window_start = 0.0
    max_window_bytes = LIVE_SAMPLE_RATE * LIVE_MAX_WINDOW_SECONDS * 2

    try:
        while True:
            pcm_bytes = await websocket.receive_bytes()
            if not pcm_bytes or len(pcm_bytes) % 2 or len(pcm_bytes) > max_window_bytes:
                logger.warning(
                    "Live audio window rejected (room=%s bytes=%s)",
                    room,
                    len(pcm_bytes),
                )
                await websocket.send_json({
                    "type": "error",
                    "message": "Invalid PCM audio window received.",
                })
                continue

            window_duration = len(pcm_bytes) / (
                LIVE_SAMPLE_RATE * LIVE_PCM_CHANNELS * LIVE_PCM_SAMPLE_WIDTH
            )
            temp_path = None
            try:
                with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as temp_file:
                    temp_path = temp_file.name

                wav_metadata = _write_live_pcm_wav(temp_path, pcm_bytes)
                logger.info(
                    "Live caller PCM received (room=%s window_start=%.2f duration=%.2f "
                    "samples=%s sample_rate=%s channels=%s encoding=pcm_s16le "
                    "peak=%s rms=%.5f)",
                    room,
                    window_start,
                    window_duration,
                    wav_metadata["frames"],
                    wav_metadata["sample_rate"],
                    wav_metadata["channels"],
                    wav_metadata["peak"],
                    wav_metadata["rms"],
                )

                analysis = await run_in_threadpool(
                    analyze_audio_file,
                    temp_path,
                    "live-call.wav",
                    "auto",
                )
                logger.info(
                    "Live audio analysis result (room=%s window_start=%.2f "
                    "transcript_segments=%s emotion_status=%s emotion_intervals=%s)",
                    room,
                    window_start,
                    len(analysis["segments"]),
                    analysis["emotion"].get("status"),
                    [
                        {
                            "start": item["start"],
                            "end": item["end"],
                            "status": item["status"],
                            "error": item["error"],
                        }
                        for item in analysis["emotion"].get("segments", [])
                    ],
                )
                await websocket.send_json({
                    "type": "analysis",
                    "window_start": round(window_start, 2),
                    "window_duration": round(window_duration, 2),
                    "analysis": analysis,
                })
            except Exception as error:
                logger.exception(
                    "Live audio analysis failed (room=%s window_start=%.2f)",
                    room,
                    window_start,
                )
                await websocket.send_json({
                    "type": "error",
                    "message": f"Live audio analysis failed: {error}",
                })
            finally:
                if temp_path and os.path.exists(temp_path):
                    try:
                        os.remove(temp_path)
                    except OSError:
                        pass

            window_start += window_duration
    except WebSocketDisconnect as error:
        logger.info(
            "Live audio WebSocket disconnected (room=%s code=%s)",
            room,
            error.code,
        )
    except Exception:
        logger.exception("Live audio WebSocket failed (room=%s)", room)
        raise
