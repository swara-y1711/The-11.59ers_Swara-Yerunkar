# CyberMitra 🛡️
### AI-Assisted Cybercrime Reporting & Investigation Platform

CyberMitra is an AI-assisted cybercrime investigation platform designed to help investigators organize complaints, analyze audio evidence, prioritize cases, and handle cybercrime helpline calls through a unified dashboard.

The platform brings together UPI fraud reporting, recorded audio analysis, live caller–investigator communication, speech transcription, voice emotion estimation, and case management to support a more structured investigation workflow.

> **Project goal:** Make cybercrime investigation workflows more organized, evidence-driven, and accessible through one integrated platform.

---

## ✨ Key Features

### 1. UPI Fraud Investigation
- Capture transaction details, including transaction amount, UPI ID, and incident information.
- Support structured incident narratives, evidence summaries, and investigation notes.
- Organize transaction-related information for investigation and case documentation.
- Help investigators review reported UPI fraud incidents through a unified workflow.

### 2. AI-Assisted Recorded Audio Analysis
- Upload and play recorded audio evidence.
- Generate speech transcripts using Faster-Whisper.
- Analyze speech segments using a Wav2Vec2-based voice emotion classification model.
- Display estimated emotion labels, confidence scores, and segment-level analysis where available.
- Present analysis results alongside the original recording for investigator review.

### 3. Live Cybercrime Helpline
- Allow callers to request a live session with an available investigator.
- Notify investigators when an incoming call is requested.
- Support call acceptance, rejection, and termination.
- Establish real-time caller–investigator audio communication.
- Process live audio windows for transcription and attempted emotion analysis.

### 4. Case Priority Management
- Support case prioritization to help investigators identify incidents that may need earlier attention.
- Organize investigation workflows around case information and urgency.
- Provide a foundation for more structured case triage.

*Priority decisions should be reviewed by investigators and should not rely solely on automated predictions.*

### 5. Evidence & Case Management
- Organize audio evidence and associated analysis results.
- Provide an audio evidence player and analysis report interface.
- Support a more structured review of case information, transcripts, and investigation findings.

### 6. Investigation Dashboard
- Bring case information, audio analysis, and investigation workflows together.
- Display analysis status and errors to support troubleshooting.
- Provide access to evidence and report-related actions available in the application.

---

## 🔄 How CyberMitra Works

1. **Report:** Capture a cybercrime complaint or UPI fraud incident.
2. **Create or select a case:** Organize the incident for investigation.
3. **Collect evidence:** Upload a recorded call or handle a live helpline interaction.
4. **Analyze:** Generate speech transcripts and attempt acoustic voice emotion classification.
5. **Review:** Examine the transcript, audio, transaction details, and available analysis results.
6. **Prioritize:** Use case information to support investigation triage.
7. **Document:** Organize findings and prepare investigation-related reports.

---

## 🧠 AI & Audio Processing

| Component | Technology |
|---|---|
| Speech transcription | Faster-Whisper |
| Transcription model | Whisper Small |
| Voice emotion estimation | Wav2Vec2 audio classification |
| Audio decoding | PyAV |
| Audio processing | NumPy |
| Backend processing | Python and FastAPI |
| Real-time communication | WebSockets and WebRTC-related signaling |

**Important:** Voice emotion classification estimates acoustic patterns. It cannot establish whether someone is lying, guilty, deceptive, or involved in a crime. Predictions may also be unreliable for languages or speaking styles not adequately represented by the model.

---

## 🏗️ Technology Stack

| Layer | Technologies |
|---|---|
| Frontend | React, JavaScript, CSS |
| Build tooling | Vite |
| Backend API | FastAPI, Python |
| Speech recognition | Faster-Whisper |
| Audio classification | Transformers, PyTorch |
| Audio decoding | PyAV |
| Numerical processing | NumPy |
| Real-time communication | WebSockets, WebRTC-related signaling |
| Version control | Git and GitHub |

---

## 📁 Project Structure

```text
CyberMitra/
├── src/
│   ├── main.jsx
│   ├── style.css
│   ├── caller.jsx
│   ├── audioEvidenceStore.js
│   ├── caseStore.js
│   ├── casePriority.jsx
│   ├── casePriorityEngine.js
│   └── requirements.txt
├── tests/
│   ├── test_audio_processing.py
│   ├── test_emotion_model_integration.py
│   └── test_live_calls.py
├── main.py
├── index.html
├── package.json
├── package-lock.json
├── README.md
└── .gitignore
```

*The structure above reflects the current project files; additional modules may exist in the repository.*

---

## ⚙️ Getting Started

### Prerequisites

- Python installed and available through PowerShell.
- Node.js and npm.
- Git.
- Internet access for installing dependencies and downloading AI models on their first use.
- A modern browser with microphone access for live-call testing.

### 1. Clone the repository

```bash
git clone https://github.com/swara-y1711/CyberMitra.git
cd CyberMitra
```

### 2. Install backend dependencies

From the repository root, run:

```powershell
python -m pip install -r src/requirements.txt
```

If your environment uses a virtual environment, activate it before installing dependencies.

### 3. Start the backend

From the directory containing `main.py`, run:

```powershell
python -m uvicorn main:app --host 127.0.0.1 --port 8081 --reload
```

The API should be available at:

- API: http://127.0.0.1:8081
- Health check: http://127.0.0.1:8081/health
- Interactive API documentation: http://127.0.0.1:8081/docs

The first transcription or emotion-analysis request may take longer while the required model files are downloaded and initialized.

### 4. Install frontend dependencies

Open a second terminal in the repository root:

```powershell
npm install
```

### 5. Start the frontend

```powershell
npm run dev
```

Open the local URL printed by the frontend development server, typically:

http://localhost:5173

If the frontend cannot reach the backend, check the configured `BACKEND_URL` in the frontend code, the backend port, and the FastAPI CORS settings.

### 6. Test the application

- Open the investigator dashboard.
- Upload a supported audio file and run analysis.
- Check the transcript and voice emotion report.
- Open a separate browser session for the caller interface.
- Start a live session and test incoming-call notification and two-way audio.
- Verify evidence saving and case association separately; successful live communication alone does not guarantee that a persistent recording was saved.

---

## 🧪 Testing

The repository includes tests for audio processing, emotion-model integration, and live-call functionality.

Review the test requirements and run the suite from the repository root:

```powershell
python -m pytest tests -v
```

Some tests may require additional dependencies, model downloads, or specific runtime conditions. A passing test suite should be verified in the target environment before deployment.

---

## 🔐 Security & Responsible Use

CyberMitra is intended to assist human investigators, not replace their judgment.

- Protect personally identifiable information, transaction details, and recorded calls.
- Never commit API keys, credentials, private recordings, or sensitive case data.
- Restrict access to investigation records and audio evidence.
- Use secure communication and appropriate authentication before production deployment.
- Validate uploaded files and enforce appropriate size limits.
- Treat AI-generated transcripts and acoustic emotion estimates as fallible outputs.
- Do not use voice emotion predictions as proof of deception, guilt, intent, or criminal activity.

---

## 🚧 Current Scope & Limitations

CyberMitra is an evolving prototype.

- Speech transcription and emotion analysis depend on audio quality, model availability, and supported languages.
- Emotion analysis may fail for some recordings or return no usable predictions.
- Live audio communication and live audio analysis are separate from persistent call recording.
- Persistent recording, evidence storage, and case association must be verified for the specific deployment.
- Case prioritization supports triage and should be validated against real investigation requirements.
- Production deployment requires further work on authentication, authorization, privacy, audit logging, and secure evidence retention.

---

## 🔮 Future Enhancements

- Stronger evidence lifecycle management and audit trails.
- Improved multilingual transcription and evaluation.
- Secure case-level access control and investigator authentication.
- More robust case-priority scoring and explainability.
- Integration with authorized cybercrime reporting and investigation systems.
- Automated regression tests for recorded and live audio workflows.
- Deployment hardening and monitoring.

---

## 🎯 Project Vision

CyberMitra aims to bring complaint handling, audio evidence analysis, live helpline communication, and investigation triage into a single workflow.

By combining practical software engineering with AI-assisted analysis, the project seeks to help investigators review evidence more efficiently while keeping important investigative decisions under human control.

---

**GitHub:** https://github.com/swara-y1711/CyberMitra

Built as an evolving cybersecurity investigation prototype.
