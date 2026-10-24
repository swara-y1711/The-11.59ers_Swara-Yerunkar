
import React, { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  AudioLines, LayoutDashboard, FolderOpen, FileCheck2, UploadCloud,
  Plus, Play, Activity, FileText, Download, Search, ShieldCheck,
  Clock3, LockKeyhole, Sparkles, Headphones, FileAudio, ChevronRight
} from "lucide-react";
import "./style.css";

const sample = [
  { start: 0, end: 7, emotion: "Neutral", confidence: 0, text: "Sample data removed after analysis." }
];

const time = n =>
  `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(Math.floor(n % 60)).padStart(2, "0")}`;

function App() {
  const [file, setFile] = useState(null);
  const [url, setUrl] = useState("");
  const [segments, setSegments] = useState([]);
  const [selected, setSelected] = useState(0);
  const [notes, setNotes] = useState("");
  const [saved, setSaved] = useState([]);
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState("");
  const [loading, setLoading] = useState(false);
  const [language, setLanguage] = useState("");
  const audio = useRef(null);
  const picker = useRef(null);
  const seg = segments[selected];

  function notify(message) {
    setToast(message);
    setTimeout(() => setToast(""), 3500);
  }

  function upload(f) {
    if (!f) return;
    if (url) URL.revokeObjectURL(url);
    setFile(f);
    setUrl(URL.createObjectURL(f));
    setSegments([]);
    setSelected(0);
    setLanguage("");
    notify("Audio loaded. Click Run analysis to transcribe it.");
  }

  async function analyze() {
    if (!file) {
      notify("Please upload an audio file first.");
      picker.current.click();
      return;
    }

    setLoading(true);
    setSegments([]);
    notify("Transcribing audio. The first run may take a few minutes.");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("http://127.0.0.1:8000/transcribe", {
        method: "POST",
        body: formData
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Transcription failed.");
      }

      const actualSegments = (data.segments || []).map((item, index) => ({
        start: item.start,
        end: item.end,
        text: item.text,
        emotion: "Not analyzed",
        confidence: null,
        color: "blue",
        id: index
      }));

      setSegments(actualSegments);
      setSelected(0);
      setLanguage(data.language || "Unknown");
      notify(actualSegments.length
        ? "Transcription completed successfully."
        : "No speech segments detected in this recording.");
    } catch (error) {
      notify("Analysis failed: " + error.message);
    } finally {
      setLoading(false);
    }
  }

  function jump(segment, index) {
    setSelected(index);
    if (audio.current && url) {
      audio.current.currentTime = segment.start;
      audio.current.play().catch(() => {});
    }
  }

  function addNote() {
    if (!notes.trim()) return notify("Write a note first.");
    setSaved([...saved, { text: notes.trim(), time: seg?.start || 0 }]);
    setNotes("");
    notify("Note added.");
  }

  function report() {
    const content = [
      "VOICETRACE AI — TRANSCRIPTION REPORT",
      "Audio: " + (file ? file.name : "No file"),
      "Detected language: " + (language || "Not analyzed"),
      "",
      "TRANSCRIPT",
      ...segments.map(s => `[${time(s.start)}–${time(s.end)}] ${s.text}`),
      "",
      "Emotion analysis has not yet been implemented.",
      "Transcript results should be checked against the original audio.",
      "",
      "INVESTIGATOR NOTES",
      ...saved.map(n => `[${time(n.time)}] ${n.text}`)
    ].join("\n");

    const link = document.createElement("a");
    const blobUrl = URL.createObjectURL(
      new Blob([content], { type: "text/plain" })
    );
    link.href = blobUrl;
    link.download = "voicetrace-transcription-report.txt";
    link.click();
    URL.revokeObjectURL(blobUrl);
    notify("Transcript report downloaded.");
  }

  const filtered = segments
    .map((s, i) => ({ ...s, i }))
    .filter(s => (s.text + " " + s.emotion).toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon"><AudioLines /></div>
          <div><b>VoiceTrace <em>AI</em></b><small>AUDIO INTELLIGENCE</small></div>
        </div>
        <label>WORKSPACE</label>
        <div className="nav active"><LayoutDashboard size={17} /> Dashboard</div>
        <div className="nav"><FolderOpen size={17} /> Investigations <span>1</span></div>
        <div className="nav"><FileCheck2 size={17} /> Reports</div>
        <div className="side-case">
          <small>● ACTIVE CASE</small>
          <b>Suspicious call review</b>
          <p>VT-2026-001</p>
          <div className="progress"><i /></div>
          <small>Review progress <strong>60%</strong></small>
        </div>
        <div className="side-bottom"><LockKeyhole size={14} /> Local prototype workspace</div>
      </aside>

      <main>
        <header>
          <div>Investigations <ChevronRight size={14} /> <b>VT-2026-001</b></div>
          <span><ShieldCheck size={14} /> Evidence review mode</span>
        </header>

        <section className="heading">
          <div>
            <small className="eyebrow">● INVESTIGATION WORKSPACE</small>
            <h1>Audio evidence review</h1>
            <p>Transcribe recordings and review the results.</p>
          </div>
          <button className="secondary" onClick={report}><Download size={15} /> Export report</button>
        </section>

        <section className="casebar">
          <div className="caseicon"><FileAudio /></div>
          <div className="caseinfo">
            <b>Suspicious call review</b>
            <small>VT-2026-001 · <Clock3 size={12} /> Created today · <LockKeyhole size={12} /> Restricted</small>
          </div>
          <button className="primary" onClick={() => picker.current.click()}>
            <Plus size={15} /> Upload audio
          </button>
          <input ref={picker} hidden type="file" accept="audio/*" onChange={e => upload(e.target.files[0])} />
        </section>

        <div className="metrics">
          <article>
            <small>AUDIO SOURCE</small>
            <b>{file ? file.name : "No audio uploaded"}</b>
            <p>{file ? `${(file.size / 1048576).toFixed(2)} MB · loaded locally` : "Upload an audio recording to begin"}</p>
          </article>
          <article>
            <small>TRANSCRIPT SEGMENTS</small>
            <b>{segments.length}</b>
            <p>Actual speech-recognition output</p>
          </article>
          <article>
            <small>ANALYSIS STATUS</small>
            <b>{loading ? "Transcribing..." : segments.length ? "Transcription complete" : "Waiting for audio"}</b>
            <p>{language ? `Detected language: ${language}` : "Emotion analysis not connected yet"}</p>
          </article>
        </div>

        <div className="grid">
          <div className="left">
            <section className="panel">
              <div className="panelhead">
                <div><h2><Headphones size={17} /> Audio player</h2><p>Listen to the original recording</p></div>
                <small className="tag">AUDIO</small>
              </div>
              <div className="audiofile">
                <div className="fileicon"><AudioLines /></div>
                <div><b>{file ? file.name : "No audio selected"}</b><small>{file ? "Uploaded audio" : "Choose an audio file"}</small></div>
                <button className="iconbtn" onClick={() => picker.current.click()}><UploadCloud size={17} /></button>
              </div>
              {url && <audio ref={audio} controls src={url} />}
              <div className="audiobottom">
                <small>● {file ? "Original file loaded" : "Waiting for upload"}</small>
                <button onClick={() => picker.current.click()}>Replace audio</button>
              </div>
              <div className="notice">
                <div><b>{loading ? "Transcribing recording..." : "Ready to analyze?"}</b>
                  <small>Speech-to-text runs on your Python backend.</small>
                </div>
                <button className="primary" onClick={analyze} disabled={loading}>
                  <Sparkles size={14} /> {loading ? "Analyzing..." : "Run analysis"}
                </button>
              </div>
            </section>

            <section className="panel">
              <div className="panelhead">
                <div><h2><Activity size={17} /> Transcript timeline</h2><p>Select a segment to replay that part</p></div>
                <small className="tag">TRANSCRIPT</small>
              </div>
              {segments.length ? (
                <>
                  <div className="timeline">
                    {segments.map((s, i) => (
                      <button key={i} className={selected === i ? "blue selected" : "blue"} onClick={() => jump(s, i)}>
                        <b>{time(s.start)}</b><small>Segment {i + 1}</small>
                      </button>
                    ))}
                  </div>
                  {seg && <div className="selected">
                    <span className="badge blue">Speech</span>
                    <div><b>{time(seg.start)} – {time(seg.end)}</b><p>{seg.text}</p></div>
                    <button className="secondary small" onClick={() => jump(seg, selected)}><Play size={12} /> Replay</button>
                  </div>}
                </>
              ) : <p className="empty">Upload audio and run analysis to generate a real transcript timeline.</p>}
              <p className="disclaimer">Transcription can make mistakes. Verify important details against the original recording.</p>
            </section>
          </div>

          <div className="right">
            <section className="panel">
              <div className="panelhead">
                <div><h2><FileText size={17} /> Transcript</h2><p>Speech recognized from your recording</p></div>
              </div>
              <div className="search"><Search size={14} /><input placeholder="Search transcript..." value={search} onChange={e => setSearch(e.target.value)} /></div>
              <div className="transcripts">
                {filtered.map(s => (
                  <button key={s.i} className={selected === s.i ? "chosen" : ""} onClick={() => jump(s, s.i)}>
                    <small>{time(s.start)}</small>
                    <span>{s.text}<em className="blue">Transcribed</em></span>
                  </button>
                ))}
                {!filtered.length && <p className="empty">Transcript will appear here after analysis.</p>}
              </div>
              <footer>{segments.length} segments <span>{language ? `Language: ${language}` : "No transcript yet"}</span></footer>
            </section>

            <section className="panel">
              <div className="panelhead">
                <div><h2><FileText size={17} /> Investigator notes</h2><p>Record observations for this case</p></div>
                <small className="tag">{saved.length}</small>
              </div>
              <label className="fieldlabel">NOTE FOR {seg ? time(seg.start) : "00:00"} SEGMENT</label>
              <textarea rows="3" placeholder="Write an observation to review later..." value={notes} onChange={e => setNotes(e.target.value)} />
              <button className="primary full" onClick={addNote}><Plus size={14} /> Add note</button>
              <div className="saved">
                {saved.length ? saved.map((n, i) => <div key={i}><small>{time(n.time)}</small><p>{n.text}</p></div>) : <p className="empty">Select a segment and add an observation.</p>}
              </div>
            </section>

            <section className="integrity">
              <ShieldCheck size={18} /><div><b>Evidence integrity</b><p>Hash verification is planned, not implemented yet.</p></div><small>PLANNED</small>
            </section>
          </div>
        </div>

        <footer className="pagefoot">VoiceTrace AI <b>Prototype v0.2</b><span>Transcription only · Verify results manually</span></footer>
      </main>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
