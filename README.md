# CyberMitra (साइबर मित्र)
### AI-Powered Speech Emotion Analysis & Incident Triage for Cybercrime Investigation

---

## 📌 Executive Overview

Frontline cybercrime desks handle dozens of simultaneous, high-stress emergency calls from distressed fraud victims, suspected fraudsters, and informants. Officers face severe cognitive overload while manually taking notes and parsing transaction details under strict time limits.

**CyberMitra** is an evidence-first cybercrime triage and investigation platform. It combines dual-stream acoustic telemetry (Speech Emotion Recognition + Bilingual Automatic Speech Recognition) with structured investigative workflows to help cyber officers identify critical distress signals, extract crucial financial forensics, and prioritize emergency calls without algorithmic bias.

---

## ⚖️ The "Emotion ≠ Truth" Fallacy & Responsible AI

Acoustic distress cues (pitch tremor, speech rate, panic markers) are vital indicators of **urgency**, not veracity. A calm caller can still be a victim, and a distressed caller may misremember details. 

**CyberMitra's Evidence-First Paradigm:**
- **SER guides officer attention:** High acoustic distress elevates triage priority so emergency responders listen first.
- **Verified evidence solves the case:** Legal evidence remains strictly grounded in verified transaction dockets, UTR references, bank logs, and independent confirmation.
- **Strict Non-Definitive Guardrails:** Every dashboard view and exported legal report bears explicit disclaimers:  
  *“Model-estimated vocal cues. Not proof of truthfulness, intent, or guilt. 100% human-in-the-loop decisions.”*

---

## 🚀 Key Features

### 1. Dual-Stream Acoustic Telemetry & ASR
- **Bilingual Hindi & English Speech Recognition:** Powered by `faster-whisper` (int8 quantized CPU-optimized inference) with Voice Activity Detection (VAD) and auto-detection for Devanagari Hindi, English, and Hinglish.
- **Acoustic Distress & Emotion Profiling:** Powered by Hugging Face `wav2vec2` transformer models to detect vocal cues (fear, panic, distress, neutral, anger) for urgency triage.

### 2. Interactive Audio Forensics Console
- **Client-Side Waveform Rendering:** Real-time peak extraction using the browser Web Audio API.
- **Timestamped Segment Navigation:** Interactive timeline allowing officers to jump directly to flagged distress moments instead of replaying lengthy 20-minute recordings.

### 3. UPI Fraud Triage & Risk Matrix
- **Intelligent Heuristic Scoring:** 8-factor risk evaluation engine evaluating unsolicited collect requests, remote screen sharing / OTP access, impersonation, and amount discrepancies.
- **Dynamic Action Prompts:** Recommends immediate operational tasks (e.g., Freeze Request via 1930 portal, bank dispute reference capture).

### 4. Evidence Integrity Checklist
- Structured 6-point verification gatekeeper ensuring UTR numbers, caller identity, call timestamps, and banking references are secured before docket closure.

### 5. Automated PDF Case Docket Export
- Instant generation of formatted, court-defensible case dockets (`jsPDF`) including session logs, full transcripts, emotion telemetry, and investigator notes.

---

## 🛠️ System Architecture

```text
               [ Telephony / Live Call Audio / File Upload ]
                                     │
                 ┌───────────────────┴───────────────────┐
                 ▼                                       ▼
    [ OpenAI Faster-Whisper ASR ]             [ HF Wav2Vec2 SER Engine ]
  • Bilingual Hindi/English transcript     • Acoustic distress cues
  • Word/Segment timestamping               • Urgency classification
                 │                                       │
                 └───────────────────┬───────────────────┘
                                     ▼
                      [ FastAPI Processing Gateway ]
                         (JSON Telemetry Payload)
                                     │
                                     ▼
                     [ CyberMitra Investigator UI ]
       ┌─────────────────────────────┼─────────────────────────────┐
       ▼                             ▼                             ▼
[ Waveform & Distress ]    [ UPI Risk Matrix ]         [ PDF Evidence Docket ]
  Time-synced scrub           8-point heuristics           Court-ready report
```

---

## 💻 Tech Stack

| Layer | Technologies |
| :--- | :--- |
| **Frontend** | React 18, Vite, Lucide Icons, Web Audio API, jsPDF |
| **Backend API** | Python 3.10+, FastAPI, Uvicorn, Python-Multipart |
| **AI Models** | Faster-Whisper (ASR / STT), Hugging Face Wav2Vec2 (SER) |
| **Audio Processing**| FFmpeg, PyAV, SoundFile, Web Audio Context |
| **Persistence** | Local secure client-side storage + Exportable PDF dockets |

---

## 🏁 Quickstart Guide

### Prerequisites
- **Node.js**: v18+ LTS
- **Python**: v3.10 or v3.11+
- **FFmpeg**: Installed and available in PATH (or installed via WinGet)

---

### Step 1: Clone the Repository
```bash
git clone https://github.com/swara-y1711/CyberMitra.git
cd CyberMitra
```

### Step 2: Start the AI Backend (FastAPI)
```bash
# 1. Install Python dependencies
pip install -r requirements.txt

# 2. Run the FastAPI server
python -m uvicorn main:app --reload --port 8000
```
*Backend runs at `http://127.0.0.1:8000` (API documentation available at `http://127.0.0.1:8000/docs`).*

### Step 3: Start the Frontend Console (React + Vite)
In a new terminal window:
```bash
# 1. Install frontend packages
npm install

# 2. Launch Vite development server
npm run dev
```
*Open `http://localhost:5173` in your browser.*

---

## 📡 API Reference

### `GET /health`
Returns system status, active speech model, and bilingual support status.

### `POST /transcribe`
Uploads call audio for end-to-end transcription and emotion telemetry.
- **Parameters:**
  - `file`: Audio file (`.wav`, `.mp3`, `.m4a`, `.ogg`, `.webm`, etc.)
  - `language`: `auto` | `hindi` | `english`
- **Response:**
  ```json
  {
    "filename": "call_sample.wav",
    "language": "hi",
    "duration": 42.5,
    "segments": [
      { "start": 0.0, "end": 4.2, "text": "सर मेरे बैंक खाते से बिना ओटीपी पैसे कट गए हैं।" }
    ],
    "transcript": "सर मेरे बैंक खाते से बिना ओटीपी पैसे कट गए हैं।",
    "emotion": {
      "status": "completed",
      "label": "distress",
      "confidence": 0.8924
    }
  }
  ```

---

## 🛡️ Responsible AI & Ethical Safeguards

1. **Human-in-the-Loop Decisions:** Predictions never make autonomous enforcement decisions; they act exclusively as an attention director for investigating officers.
2. **Bilingual Equity:** Explicit support for Indian linguistic realities (Hindi, English, Hinglish).
3. **Data Privacy:** Local and edge-friendly inference architecture to safeguard sensitive call audio and caller PII.


