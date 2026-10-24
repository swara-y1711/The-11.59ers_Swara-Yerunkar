
import os
import tempfile
from pathlib import Path

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from faster_whisper import WhisperModel

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

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

whisper_model = None
emotion_classifier = None


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
        from transformers import pipeline

        emotion_classifier = pipeline(
            "audio-classification",
            model="Dpngtm/wav2vec2-emotion-recognition",
            device=-1,
        )

    return emotion_classifier


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
        ".webm", ".ogg", ".flac", ".mpeg", ".mpga",
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

        model = get_whisper_model()

        segments_generator, info = model.transcribe(
            temp_path,
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

        # ------------------------------------------
        # Emotion analysis
        # ------------------------------------------

        emotion = {
            "status": "unavailable",
            "label": None,
            "confidence": None,
            "error": None,
        }

        try:
            classifier = get_emotion_classifier()
            predictions = classifier(temp_path)

            if predictions:
                best = max(
                    predictions,
                    key=lambda item: item.get("score", 0),
                )

                emotion = {
                    "status": "success",
                    "label": best.get("label"),
                    "confidence": round(
                        float(best.get("score", 0)), 4
                    ),
                    "error": None,
                }

        except Exception as error:
            emotion = {
                "status": "error",
                "label": None,
                "confidence": None,
                "error": str(error),
            }

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

    except HTTPException:
        raise

    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail=f"Audio processing failed: {str(error)}",
        )

    finally:
        if temp_path and os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except OSError:
                pass

        await file.close()
