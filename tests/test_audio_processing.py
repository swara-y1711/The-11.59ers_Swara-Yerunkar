import logging
import math
import struct
import wave
from types import SimpleNamespace

import numpy as np
from fastapi.testclient import TestClient

import main


def write_tone(path, duration=2, sample_rate=16000):
    samples = (
        struct.pack(
            "<h",
            int(12000 * math.sin(2 * math.pi * 440 * index / sample_rate)),
        )
        for index in range(int(sample_rate * duration))
    )
    with wave.open(str(path), "wb") as audio_file:
        audio_file.setnchannels(1)
        audio_file.setsampwidth(2)
        audio_file.setframerate(sample_rate)
        audio_file.writeframes(b"".join(samples))


def test_decode_audio_for_transcription_with_pyav(tmp_path):
    audio_path = tmp_path / "tone.wav"
    sample_rate = 16000
    sample_count = sample_rate // 2
    write_tone(audio_path, duration=0.5, sample_rate=sample_rate)

    audio = main._decode_audio_for_transcription(str(audio_path))

    assert isinstance(audio, np.ndarray)
    assert audio.dtype == np.float32
    assert audio.shape == (sample_count,)
    assert np.max(np.abs(audio)) > 0.25


def test_decode_stereo_audio_to_mono_at_target_sample_rate(tmp_path):
    audio_path = tmp_path / "stereo.wav"
    sample_rate = 44100
    sample_count = sample_rate
    samples = bytearray()
    for index in range(sample_count):
        value = int(9000 * math.sin(2 * math.pi * 440 * index / sample_rate))
        samples.extend(struct.pack("<hh", value, value))

    with wave.open(str(audio_path), "wb") as audio_file:
        audio_file.setnchannels(2)
        audio_file.setsampwidth(2)
        audio_file.setframerate(sample_rate)
        audio_file.writeframes(samples)

    audio = main._decode_audio_for_transcription(str(audio_path))

    assert audio.dtype == np.float32
    assert audio.ndim == 1
    assert abs(len(audio) - 16000) <= 1


def test_live_pcm_is_written_as_mono_16khz_signed_16bit_wav(tmp_path):
    audio_path = tmp_path / "live-call.wav"
    pcm = np.array([0, 8192, -16384, 32767], dtype="<i2").tobytes()

    metrics = main._write_live_pcm_wav(str(audio_path), pcm)

    with wave.open(str(audio_path), "rb") as audio_file:
        assert audio_file.getnchannels() == 1
        assert audio_file.getsampwidth() == 2
        assert audio_file.getframerate() == 16000
        assert audio_file.getnframes() == 4
        assert audio_file.readframes(4) == pcm

    decoded = main._decode_audio_for_transcription(str(audio_path))
    assert np.max(np.abs(decoded)) > 0.99
    assert metrics["channels"] == 1
    assert metrics["sample_width"] == 2
    assert metrics["sample_rate"] == 16000
    assert metrics["frames"] == 4
    assert metrics["peak"] == 32767
    assert abs(metrics["rms"] - 0.5728) < 0.001


def test_emotion_chunks_split_long_speech_into_model_sized_clips():
    audio = np.zeros(20 * 16000, dtype=np.float32)

    chunks = list(main._speech_audio_chunks(audio, [{"start": 0, "end": 20}]))

    assert [round(end - start, 1) for start, end, _ in chunks] == [8.0, 8.0, 4.0]
    assert all(len(chunk) <= 8 * 16000 for _, _, chunk in chunks)


def test_transcribe_returns_chunked_emotion_result_for_valid_audio(tmp_path, monkeypatch):
    audio_path = tmp_path / "tone.wav"
    write_tone(audio_path)

    class FakeWhisper:
        def transcribe(self, audio, **kwargs):
            assert isinstance(audio, np.ndarray)
            assert audio.dtype == np.float32
            return iter([SimpleNamespace(start=0.0, end=1.5, text="Test speech")]), SimpleNamespace(
                language="en",
                language_probability=0.99,
                duration=2.0,
            )

    monkeypatch.setattr(main, "get_whisper_model", lambda: FakeWhisper())
    monkeypatch.setattr(main, "get_emotion_classifier", lambda: object())
    monkeypatch.setattr(
        main,
        "_predict_emotion_batch",
        lambda classifier, chunks: [
            {"angry": 0.8, "calm": 0.2} for _ in chunks
        ],
    )

    with TestClient(main.app) as client:
        response = client.post(
            "/transcribe",
            files={"file": ("recording.wav", audio_path.read_bytes(), "audio/wav")},
        )

    assert response.status_code == 200
    result = response.json()
    assert result["segments"] == [{"start": 0.0, "end": 1.5, "text": "Test speech"}]
    assert result["emotion"]["status"] == "completed"
    assert result["emotion"]["label"] == "angry"
    assert result["emotion"]["confidence"] == 0.8
    assert result["emotion"]["analyzed_duration"] == 1.5
    assert result["emotion"]["segments_analyzed"] == 1
    assert result["emotion"]["total_segments"] == 1
    assert result["emotion"]["segments"] == [{
        "start": 0.0,
        "end": 1.5,
        "status": "completed",
        "label": "angry",
        "confidence": 0.8,
        "error": None,
    }]

    with TestClient(main.app) as client:
        retry_response = client.post(
            "/analyze-emotion",
            data={"segments": '[{"start": 0.0, "end": 1.5}]'},
            files={"file": ("recording.wav", audio_path.read_bytes(), "audio/wav")},
        )

    assert retry_response.status_code == 200
    assert retry_response.json()["emotion"]["status"] == "completed"
    assert retry_response.json()["emotion"]["label"] == "angry"


def test_transcribe_rejects_unsupported_audio():
    with TestClient(main.app) as client:
        response = client.post(
            "/transcribe",
            files={"file": ("recording.txt", b"not audio", "text/plain")},
        )

    assert response.status_code == 400
    assert response.json()["detail"] == "Unsupported audio format."


def test_transcribe_rejects_empty_audio():
    with TestClient(main.app) as client:
        response = client.post(
            "/transcribe",
            files={"file": ("recording.wav", b"", "audio/wav")},
        )

    assert response.status_code == 400
    assert response.json()["detail"] == "The uploaded audio file is empty."


def test_failed_emotion_model_response_is_returned_as_error(tmp_path, monkeypatch):
    audio_path = tmp_path / "tone.wav"
    write_tone(audio_path)

    class FakeWhisper:
        def transcribe(self, audio, **kwargs):
            return iter([SimpleNamespace(start=0.0, end=1.5, text="Test speech")]), SimpleNamespace(
                language="en",
                language_probability=0.99,
                duration=2.0,
            )

    monkeypatch.setattr(main, "get_whisper_model", lambda: FakeWhisper())
    monkeypatch.setattr(
        main,
        "get_emotion_classifier",
        lambda: object(),
    )
    monkeypatch.setattr(main, "_predict_emotion_batch", lambda classifier, chunks: [{} for _ in chunks])

    with TestClient(main.app) as client:
        response = client.post(
            "/transcribe",
            files={"file": ("recording.wav", audio_path.read_bytes(), "audio/wav")},
        )

    assert response.status_code == 200
    result = response.json()
    assert result["transcript"] == "Test speech"
    assert result["emotion"]["status"] == "failed"
    assert result["emotion"]["label"] is None
    assert result["emotion"]["confidence"] is None
    assert "no valid class scores" in result["emotion"]["error"]


def test_silent_audio_is_not_reported_as_neutral():
    audio = np.zeros(16000, dtype=np.float32)

    result = main._analyze_emotion(audio, [{"start": 0, "end": 1}])

    assert result["status"] == "failed"
    assert result["label"] is None
    assert result["confidence"] is None
    assert result["segments"][0]["status"] == "skipped"
    assert "No audible speech" in result["error"]


def test_audible_speech_shorter_than_model_minimum_is_reported_as_skipped():
    audio = np.full(int(main.EMOTION_SAMPLE_RATE * 0.25), 0.2, dtype=np.float32)

    result = main._analyze_emotion(audio, [{"start": 0, "end": 0.25}])

    assert result["status"] == "failed"
    assert result["label"] is None
    assert result["segments"][0]["status"] == "skipped"
    assert "shorter than the model's 0.5-second minimum" in result["segments"][0]["error"]
    assert result["error"] == "No audible speech intervals long enough for emotion analysis were found."


def test_emotion_api_returns_failure_for_corrupt_audio():
    with TestClient(main.app) as client:
        response = client.post(
            "/analyze-emotion",
            data={"segments": '[{"start": 0, "end": 1}]'},
            files={"file": ("recording.wav", b"not a wav file", "audio/wav")},
        )

    assert response.status_code == 200
    assert response.json()["emotion"]["status"] == "failed"
    assert response.json()["emotion"]["error"]


def test_emotion_api_reports_missing_model_dependency(monkeypatch, tmp_path):
    audio_path = tmp_path / "tone.wav"
    write_tone(audio_path)
    monkeypatch.setattr(
        main,
        "get_emotion_classifier",
        lambda: (_ for _ in ()).throw(ModuleNotFoundError("No module named 'transformers'")),
    )

    with TestClient(main.app) as client:
        response = client.post(
            "/analyze-emotion",
            data={"segments": '[{"start": 0, "end": 1.5}]'},
            files={"file": ("recording.wav", audio_path.read_bytes(), "audio/wav")},
        )

    assert response.status_code == 200
    assert response.json()["emotion"]["status"] == "failed"
    assert response.json()["emotion"]["error"] == "No module named 'transformers'"


def test_emotion_retry_recovers_after_initial_model_failure(monkeypatch, tmp_path):
    audio_path = tmp_path / "tone.wav"
    write_tone(audio_path)
    calls = 0

    def get_classifier():
        nonlocal calls
        calls += 1
        if calls == 1:
            raise ModuleNotFoundError("model unavailable for first request")
        return object()

    monkeypatch.setattr(main, "get_whisper_model", lambda: SimpleNamespace(
        transcribe=lambda audio, **kwargs: (
            iter([SimpleNamespace(start=0.0, end=1.5, text="Test speech")]),
            SimpleNamespace(language="en", language_probability=0.99, duration=2.0),
        )
    ))
    monkeypatch.setattr(main, "get_emotion_classifier", get_classifier)
    monkeypatch.setattr(
        main,
        "_predict_emotion_batch",
        lambda classifier, chunks: [
            {"sad": 0.9, "happy": 0.1} for _ in chunks
        ],
    )

    with TestClient(main.app) as client:
        initial = client.post(
            "/transcribe",
            files={"file": ("recording.wav", audio_path.read_bytes(), "audio/wav")},
        )
        assert initial.status_code == 200
        assert initial.json()["segments"]
        assert initial.json()["emotion"]["status"] == "failed"

        retry = client.post(
            "/analyze-emotion",
            data={"segments": '[{"start": 0.0, "end": 1.5}]'},
            files={"file": ("recording.wav", audio_path.read_bytes(), "audio/wav")},
        )

    assert retry.status_code == 200
    assert retry.json()["emotion"]["status"] == "completed"
    assert retry.json()["emotion"]["label"] == "sad"


def test_long_emotion_audio_returns_interval_timestamps_and_partial_status(monkeypatch):
    audio = np.concatenate((
        np.ones(8 * 16000, dtype=np.float32) * 0.1,
        np.ones(8 * 16000, dtype=np.float32) * -0.1,
        np.ones(4 * 16000, dtype=np.float32) * 0.1,
    ))
    monkeypatch.setattr(main, "get_emotion_classifier", lambda: object())

    def predict(classifier, chunks):
        if any(np.mean(chunk) < 0 for chunk in chunks):
            raise RuntimeError("model failed for this interval")
        return [{"angry": 0.7, "calm": 0.3} for _ in chunks]

    monkeypatch.setattr(main, "_predict_emotion_batch", predict)

    result = main._analyze_emotion(audio, [{"start": 0, "end": 20}])

    assert result["status"] == "partial"
    assert result["segments_analyzed"] == 2
    assert result["total_segments"] == 3
    assert [(item["start"], item["end"]) for item in result["segments"]] == [
        (0.0, 8.0),
        (8.0, 16.0),
        (16.0, 20.0),
    ]
    assert result["segments"][1]["status"] == "failed"
    assert result["label"] == "angry"


def test_transcribe_audio_logs_traceback_and_returns_clear_error(monkeypatch, caplog):
    def fail_analysis(*args):
        raise RuntimeError("decoder failure")

    monkeypatch.setattr(main, "analyze_audio_file", fail_analysis)
    caplog.set_level(logging.ERROR, logger="uvicorn.error")

    with TestClient(main.app) as client:
        response = client.post(
            "/transcribe",
            files={"file": ("recording.wav", b"wav data", "audio/wav")},
        )

    assert response.status_code == 500
    assert response.json()["detail"] == "Audio processing failed: decoder failure"
    assert "Traceback (most recent call last)" in caplog.text
    assert "RuntimeError: decoder failure" in caplog.text
