# VoiceTrace AI Prototype v0.1

## What is included
- React + Vite responsive dashboard
- Upload and play an audio file locally in the browser
- Sample emotion timeline and sample timestamped transcript
- Click transcript/timeline segments to select them and jump audio playback
- Investigator notes
- Export a text report

## Important: AI is not connected yet
Emotion labels and transcript are illustrative sample data. They are not generated from your uploaded audio. This is a clickable UI prototype, not yet an AI investigation tool.

## Run on Windows
1. Install Node.js LTS from https://nodejs.org/ if needed.
2. Extract this ZIP.
3. Open the extracted folder in VS Code.
4. Open Terminal > New Terminal and run:
   ```powershell
   npm install
   npm run dev
   ```
5. Open the localhost URL printed by Vite (usually http://localhost:5173).

## Demo
Upload an audio file, click transcript segments to select them, add notes, and export the report. The audio player uses your selected file, but displayed transcript/emotion segments are sample data.

Use only staged/consented recordings for demos. Do not upload sensitive real recordings. Emotion does not prove deception or guilt.
