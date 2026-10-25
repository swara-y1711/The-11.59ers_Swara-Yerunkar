# CyberMitra

CyberMitra is a React + Vite investigation dashboard with recorded-audio analysis and a simulated live browser call.

## Features

- Upload, play, and analyze recorded audio through the FastAPI backend.
- Transcribe with Faster-Whisper and classify voice-emotion estimates from short speech chunks with the existing Wav2Vec2 model.
- Flag transcript segments for investigator review.
- Accept incoming two-session WebRTC calls between a caller and an available investigator. The investigator's browser forwards only the received caller audio to FastAPI for analysis.
- Organize UPI investigation notes, evidence, timelines, and reports locally in the browser.
- Triage fictional cases in **Case Priority & Intelligence** with explainable priority rules, filters, case detail, and demo-only status, note, and priority-override actions.

## Run on Windows

1. Install Node.js LTS and Python 3.14 (the checked-in PyTorch CPU wheel supports this version on Windows).
2. From the project directory, install the frontend dependencies and start Vite:
   ```powershell
   npm install
   npm run dev
   ```
3. In another terminal from the project directory, install the backend requirements and start FastAPI:
   ```powershell
   python -m pip install -r src\requirements.txt
   python -m uvicorn main:app --reload --port 8081
   ```
4. Open the Vite URL (usually `http://localhost:5173`) in two browser sessions.

## Simulated live call

Open the investigator dashboard and select **Start Live Session** in Audio Forensics. The status changes to **Waiting for incoming calls**. In a second browser session open `/caller`, grant microphone access, and select **Call Helpline**. The investigator can accept or decline the incoming request. Accepted calls use the existing WebRTC offer/answer and ICE signaling; declining, cancellation, disconnection, or a 45-second unanswered request clears the pairing. Only the investigator's received caller track is buffered and sent for live interim analysis. Interim audio windows are 15 seconds so speech intervals are less likely to be split below the emotion model's 0.5-second minimum. The backend logs the received PCM sample count, rate, channels, encoding, peak, RMS, transcription interval count, and emotion interval skip reasons to diagnose quiet or short speech without inventing output.

When the investigator ends an active call, the captured caller PCM is finalized as mono 16-kHz, signed 16-bit little-endian WAV and submitted to the existing `POST /transcribe` workflow for final full-recording analysis. Interim call output stays labeled as provisional; the existing recorded-call panel, report export, and case registration use the final transcript and actual model response. A successful case stores its metadata in the existing browser localStorage case store and the caller-only WAV in browser IndexedDB so the recording can be restored after reload. Empty calls do not create cases; interrupted calls with captured audio are marked as interrupted; failed final analysis is recorded as a failure and does not block saving the audio case. The live recording limit is 50 minutes.

The frontend connects to the backend at `http://127.0.0.1:8081`. Call availability and requests use `/ws/live-calls`; accepted sessions use the existing `/ws/signaling/{room}` endpoint with a one-time role-specific authorization, and analysis uses `/ws/live-audio/{room}`. The local broker is in-memory, single-process, and has no authentication or TURN relay. This demo is intended for two sessions on the same computer using localhost; it is not a phone integration and may not connect across restrictive networks. The live analysis runs in short windows and may lag behind the call on a CPU-bound backend. End the call when finished.

## Case Priority & Intelligence prototype

Select **Case Priority & Intelligence** in the investigator navigation. The queue contains 10 fictional, clearly marked demo records and supports search plus priority, complaint type, status, and officer filters. Case status, investigator notes, and priority overrides are saved only in the current browser's local storage. The priority assessment lives in `src\casePriorityEngine.js`; safety concerns always require urgent human review, reported loss does not determine priority, and missing indicators are treated as uncertainty rather than low risk.

The existing backend has no case-management API/database or authentication/role-based permissions. Consequently, this feature is explicitly a local demo and does not claim server persistence or authorization. Before using it with real reports, integrate a secured case API and database, enforce investigator permissions server-side, and review data minimization/retention requirements.

Run the focused backend tests and Python syntax checks from the project directory:

```powershell
python -m pytest -q tests\test_audio_processing.py tests\test_live_calls.py
python -m py_compile main.py tests\test_audio_processing.py tests\test_live_calls.py
npm run build
```

The ordinary tests use small generated WAV fixtures and do not download model files. To explicitly smoke-test real inference against the pinned model (first run downloads and caches the roughly 380 MB model weights), use:

```powershell
$env:CYBERMITRA_RUN_MODEL_TESTS = "1"
python -m pytest -q tests\test_emotion_model_integration.py
Remove-Item Env:CYBERMITRA_RUN_MODEL_TESTS
```

## Limitations

Voice emotion uses the pinned [Dpngtm/wav2vec2-emotion-recognition](https://huggingface.co/Dpngtm/wav2vec2-emotion-recognition) revision `033a5751a5bbe5b0b67c2c71e6102c38de35a346`. Its model configuration labels are **angry, calm, disgust, fearful, happy, sad, and surprised**; the backend uses those configured labels without renaming classes. This is an English-trained `Wav2Vec2ForSequenceClassification` model loaded with `AutoProcessor` and `AutoModelForAudioClassification`. PyAV decodes and resamples mono/stereo inputs to 16-kHz mono float audio, so `torchaudio` is not required. Transcript speech intervals are split into chunks of at most 8 seconds and batched for CPU inference. The overall label is the class with the highest duration-weighted mean model score over successfully analyzed intervals; the reported confidence is that same weighted mean. Interval timestamps, status, and model scores are returned separately. Inference has a five-minute processing budget; an incomplete run is marked partial. PyTorch is pinned to its Windows-compatible CPU wheel (`2.14.1+cpu`), and Transformers to `4.57.6`; PyAV `19.0.2` is pinned because the previous `14.2.0` version has no Python 3.14 Windows wheel. Model weights are downloaded from Hugging Face on first inference and cached in the standard Hugging Face cache (`HF_HOME` can point that cache elsewhere). If dependencies, network access, or cached model files are unavailable, transcription remains usable and the emotion report displays the failure details.

Voice emotion is an uncertain acoustic estimate, not proof of deception, guilt, intent, victim status, or whether a crime occurred. Results for languages other than English may be unreliable. Review all automated output against the original audio and independent evidence. If model loading or inference fails, the transcript remains available, the report displays the backend error, and **Retry emotion analysis** retries only emotion analysis using the existing transcript segments.

Use only staged or consented recordings for demos. Do not upload sensitive real recordings.
