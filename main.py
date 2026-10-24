
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from faster_whisper import WhisperModel
import tempfile
import os
import traceback

app = FastAPI(title="CyberMitra API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

model = None


@app.get("/")
def home():
    return {
        "message": "CyberMitra backend is running"
    }


@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "CyberMitra API",
        "transcription": "Whisper"
    }


@app.post("/transcribe")
async def transcribe_audio(file: UploadFile = File(...)):
    global model

    if not file.filename:
        raise HTTPException(
            status_code=400,
            detail="No filename provided"
        )

    suffix = os.path.splitext(file.filename)[1] or ".wav"
    temp_path = None

    try:
        # Save uploaded audio temporarily
        with tempfile.NamedTemporaryFile(
            delete=False,
            suffix=suffix
        ) as temp_file:
            temp_path = temp_file.name

            while True:
                chunk = await file.read(1024 * 1024)

                if not chunk:
                    break

                temp_file.write(chunk)

        # Load Whisper only when first needed
        if model is None:
            model = WhisperModel(
                "base",
                device="cpu",
                compute_type="int8"
            )

        # Transcribe Hindi or English audio
        segments, info = model.transcribe(
            temp_path,
            beam_size=5
        )

        results = []

        for segment in segments:
            results.append({
                "start": round(segment.start, 2),
                "end": round(segment.end, 2),
                "text": segment.text.strip()
            })

        transcript = " ".join(
            item["text"] for item in results
        )

        return {
            "language": info.language,
            "duration": info.duration,
            "segments": results,
            "transcript": transcript
        }

    except Exception as error:
        print("\n--- CYBERMITRA TRANSCRIPTION ERROR ---")
        traceback.print_exc()
        print("--- END OF ERROR ---\n")

        raise HTTPException(
            status_code=500,
            detail=f"Transcription failed: {str(error)}"
        )

    finally:
        if temp_path and os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except OSError:
                pass

        await file.close()
