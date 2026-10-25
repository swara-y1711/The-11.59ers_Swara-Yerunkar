import math
import os
import struct
import wave

import pytest
from fastapi.testclient import TestClient

import main


@pytest.mark.skipif(
    os.environ.get("CYBERMITRA_RUN_MODEL_TESTS") != "1",
    reason="Set CYBERMITRA_RUN_MODEL_TESTS=1 to run/download the real model.",
)
def test_real_emotion_model_inference_on_wav_smoke_clip(tmp_path):
    audio_path = tmp_path / "model-smoke-tone.wav"
    sample_rate = 16000
    frame_count = sample_rate * 2
    with wave.open(str(audio_path), "wb") as audio_file:
        audio_file.setnchannels(1)
        audio_file.setsampwidth(2)
        audio_file.setframerate(sample_rate)
        audio_file.writeframes(b"".join(
            struct.pack(
                "<h",
                int(10000 * math.sin(2 * math.pi * 330 * index / sample_rate)),
            )
            for index in range(frame_count)
        ))

    previous_classifier = main.emotion_classifier
    main.emotion_classifier = None
    try:
        with TestClient(main.app) as client:
            response = client.post(
                "/analyze-emotion",
                data={"segments": '[{"start": 0.0, "end": 2.0}]'},
                files={
                    "file": (
                        audio_path.name,
                        audio_path.read_bytes(),
                        "audio/wav",
                    )
                },
            )
        assert response.status_code == 200
        result = response.json()["emotion"]
    finally:
        main.emotion_classifier = previous_classifier

    supported_labels = {
        "angry", "calm", "disgust", "fearful", "happy", "sad", "surprised"
    }
    assert result["status"] == "completed"
    assert result["label"] in supported_labels
    assert 0 <= result["confidence"] <= 1
    assert result["analyzed_duration"] == 2.0
    assert result["segments"][0]["start"] == 0
    assert result["segments"][0]["end"] == 2
