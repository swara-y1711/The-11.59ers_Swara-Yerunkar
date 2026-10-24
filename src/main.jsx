import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  AudioLines, LayoutDashboard, FolderOpen, FileCheck2, UploadCloud,
  Plus, Play, Activity, FileText, Download, Search, ShieldCheck,
  Clock3, LockKeyhole, Sparkles, Headphones, FileAudio, ChevronRight,
  Flag, ClipboardCheck, Fingerprint, Trash2,
  Mic, ShieldAlert, RefreshCw, Wifi, WifiOff
} from "lucide-react";
import "./style.css";
import { jsPDF } from "jspdf";

const CASE_KEY = "cybermitra-case-v1";
const UPI_CASES_KEY = "cybermitra-upi-cases-v1";
const BACKEND_URL = "http://127.0.0.1:8000";

const NAV = [
  { id: "overview", name: "Overview", short: "Overview", icon: LayoutDashboard },
  { id: "upi", name: "UPI Fraud Investigation", short: "UPI fraud", icon: ShieldCheck },
  { id: "audio", name: "Audio Forensics", short: "Audio", icon: AudioLines },
  { id: "integrity", name: "Evidence Integrity", short: "Integrity", icon: Fingerprint },
  { id: "timeline", name: "Investigation Timeline", short: "Timeline", icon: Clock3 },
  { id: "reports", name: "Reports", short: "Reports", icon: FileCheck2 }
];

const defaultEvidence = [
  { id: 1, name: "Original audio recording", status: "pending" },
  { id: 2, name: "Transcript reviewed against audio", status: "pending" },
  { id: 3, name: "Caller identity independently verified", status: "pending" },
  { id: 4, name: "Call date and time verified", status: "pending" },
  { id: 5, name: "Relevant transaction records", status: "pending" },
  { id: 6, name: "UPI ID or transaction reference", status: "pending" }
];

const UPI_INDICATORS = [
  "Unexpected collect/payment request",
  "Unfamiliar UPI ID",
  "Possible impersonation",
  "Pressure or urgency to transfer money",
  "Multiple unexplained transactions",
  "Request for OTP, UPI PIN or screen access",
  "Money transferred but goods or service not received",
  "Recipient or amount differs from expectations"
];

const UPI_INDICATOR_RULES = {
  "Unexpected collect/payment request": {
    points: 2,
    explanation: "An unexpected payment request should be checked against the user's account of events.",
    action: "Verify whether the payment request was expected and who initiated it."
  },
  "Unfamiliar UPI ID": {
    points: 2,
    explanation: "The recipient's identity may not match a known or intended contact.",
    action: "Verify the recipient identity using trusted records."
  },
  "Possible impersonation": {
    points: 3,
    explanation: "Someone may have claimed to represent a trusted person or organization.",
    action: "Verify the claimed identity through an independent, trusted channel."
  },
  "Pressure or urgency to transfer money": {
    points: 2,
    explanation: "Urgency or pressure can be used in social-engineering scams.",
    action: "Preserve messages and review the circumstances of the payment."
  },
  "Multiple unexplained transactions": {
    points: 3,
    explanation: "Several unexplained transactions may need to be reviewed together.",
    action: "Compare transaction records, timestamps, amounts and references."
  },
  "Request for OTP, UPI PIN or screen access": {
    points: 3,
    explanation: "Requests for confidential credentials or device access are serious security warning signs.",
    action: "Never share an OTP or UPI PIN. If credentials were exposed, contact the bank immediately."
  },
  "Money transferred but goods or service not received": {
    points: 2,
    explanation: "A payment without the promised goods or service requires supporting evidence and follow-up.",
    action: "Preserve the order, payment and seller communications."
  },
  "Recipient or amount differs from expectations": {
    points: 3,
    explanation: "A mismatch between the intended and recorded payment needs verification.",
    action: "Compare the payment confirmation with the original payment instructions."
  }
};

function analyzeUPICase(item) {
  if (!item) return null;

  const selected = (item.indicators || [])
    .map(name => ({
      name,
      ...(UPI_INDICATOR_RULES[name] || {})
    }))
    .filter(rule => Number.isFinite(rule.points));

  const score = selected.reduce((total, rule) => total + rule.points, 0);

  let level = "Insufficient indicators";
  let description =
    "No warning indicators are selected. This does not establish that the transaction is safe.";

  if (score >= 7) {
    level = "High review priority";
    description =
      "Several or higher-weight warning indicators are selected. Prioritize verification and preserve available evidence.";
  } else if (score >= 4) {
    level = "Moderate review priority";
    description =
      "The selected indicators warrant additional checks before drawing conclusions.";
  } else if (score > 0) {
    level = "Low review priority";
    description =
      "At least one warning indicator is selected. Review it and verify the available information.";
  }

  const actions = [...new Set(selected.map(rule => rule.action))];

  if (!item.transactionId || !item.transactionDate) {
    actions.unshift(
      "Obtain and verify the transaction reference and transaction date/time."
    );
  }

  if (!item.evidenceNotes?.trim()) {
    actions.push(
      "Record what supporting evidence is available and what is still missing."
    );
  }

  if (
    item.transactionStatus === "Disputed" ||
    Number(item.lossAmount) > 0
  ) {
    actions.unshift(
      "Contact the bank or payment app promptly through its official channel and retain the complaint reference."
    );
  }

  return {
    score,
    level,
    description,
    selected,
    actions: [...new Set(actions)]
  };
}

function levelSlug(level = "") {
  if (level.startsWith("High")) return "high";
  if (level.startsWith("Moderate")) return "moderate";
  if (level.startsWith("Low")) return "low";
  return "none";
}

const time = n =>
  `${String(Math.floor((n || 0) / 60)).padStart(2, "0")}:${String(Math.floor((n || 0) % 60)).padStart(2, "0")}`;

function fmtDate(value) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "Timestamp unavailable" : d.toLocaleString();
}

function fmtMoney(value) {
  if (value === "" || value === undefined || value === null) return "—";
  const n = Number(value);
  return Number.isFinite(n) ? `₹${n.toLocaleString("en-IN")}` : "—";
}

function loadSavedCase() {
  try {
    return JSON.parse(localStorage.getItem(CASE_KEY)) || {};
  } catch {
    return {};
  }
}

function loadUPICases() {
  try {
    const value = JSON.parse(localStorage.getItem(UPI_CASES_KEY));
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function newUPICase() {
  return {
    id: `UPI-${Date.now()}`,
    title: "UPI fraud investigation",
    transactionId: "",
    amount: "",
    transactionDate: "",
    senderUPI: "",
    receiverUPI: "",
    bankApp: "",
    transactionStatus: "Unknown",
    lossAmount: "",
    narrative: "",
    investigatorNotes: "",
    evidenceNotes: "",
    indicators: [],
    nextAction: "Contact bank or payment app",
    createdAt: new Date().toISOString()
  };
}

/* Real waveform: decodes the uploaded file in the browser and reduces it to peak bars. */
async function buildWaveform(file, bars = 110) {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx || file.size > 60 * 1048576) return null;

  const ctx = new Ctx();
  try {
    const decoded = await ctx.decodeAudioData(await file.arrayBuffer());
    const channel = decoded.getChannelData(0);
    const size = Math.max(1, Math.floor(channel.length / bars));
    const peaks = [];

    for (let i = 0; i < bars; i++) {
      let sum = 0;
      const start = i * size;
      const end = Math.min(start + size, channel.length);
      for (let j = start; j < end; j++) sum += channel[j] * channel[j];
      peaks.push(Math.sqrt(sum / Math.max(1, end - start)));
    }

    const max = Math.max(...peaks, 0.0001);
    return peaks.map(p => Math.max(0.04, p / max));
  } finally {
    ctx.close?.();
  }
}

function UPIInvestigation({ notify, onCasesChange }) {
  const [cases, setCases] = useState(loadUPICases);
  const [activeId, setActiveId] = useState(
    () => loadUPICases()[0]?.id || ""
  );

  const activeCase = cases.find(c => c.id === activeId);
  const analysis = analyzeUPICase(activeCase);

  useEffect(() => {
    try {
      localStorage.setItem(UPI_CASES_KEY, JSON.stringify(cases));
    } catch {
      notify("Storage is full. Export your reports.");
    }
    onCasesChange?.(cases);
  }, [cases]);

  function update(field, value) {
    setCases(prev => prev.map(c =>
      c.id === activeId ? { ...c, [field]: value } : c
    ));
  }

  function createCase() {
    const item = newUPICase();
    setCases(prev => [item, ...prev]);
    setActiveId(item.id);
    notify("New UPI case created.");
  }

  function toggleIndicator(indicator) {
    if (!activeCase) return;

    const updated = activeCase.indicators.includes(indicator)
      ? activeCase.indicators.filter(x => x !== indicator)
      : [...activeCase.indicators, indicator];

    update("indicators", updated);
  }

  function deleteCase() {
    if (!activeCase) return;
    if (!window.confirm("Delete this UPI case from this browser?")) return;

    const remaining = cases.filter(c => c.id !== activeId);
    setCases(remaining);
    setActiveId(remaining[0]?.id || "");
    notify("UPI case deleted.");
  }

  function exportPDF() {
    if (!activeCase) {
      notify("Create a UPI case first.");
      return;
    }

    const doc = new jsPDF();
    const left = 15;
    const width = 180;
    let y = 20;

    function ensureSpace(height) {
      if (y + height > 280) {
        doc.addPage();
        y = 20;
      }
    }

    function heading(text) {
      ensureSpace(12);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text(text, left, y);
      y += 8;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
    }

    function line(label, value) {
      const text = `${label}: ${value || "Not provided"}`;
      const wrapped = doc.splitTextToSize(text, width);
      ensureSpace(wrapped.length * 5 + 4);
      doc.text(wrapped, left, y);
      y += wrapped.length * 5 + 3;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(17);
    doc.text("CyberMitra - UPI Investigation", left, y);
    y += 12;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);

    line("Case ID", activeCase.id);
    line("Case title", activeCase.title);
    line("Report generated", new Date().toLocaleString());

    heading("TRANSACTION DETAILS");
    line("Transaction reference / UTR", activeCase.transactionId);
    line("Amount (INR)", activeCase.amount);
    line("Transaction date and time", activeCase.transactionDate);
    line("Sender UPI ID", activeCase.senderUPI);
    line("Receiver UPI ID", activeCase.receiverUPI);
    line("Bank or payment app", activeCase.bankApp);
    line("Transaction status", activeCase.transactionStatus);
    line("Reported loss (INR)", activeCase.lossAmount);

    heading("INCIDENT DESCRIPTION");
    line("Narrative", activeCase.narrative);

    heading("POTENTIAL WARNING INDICATORS");
    if (activeCase.indicators.length) {
      activeCase.indicators.forEach(item => line("Indicator", item));
    } else {
      line("Indicators", "None selected");
    }

    heading("SUSPICIOUS TRANSACTION ANALYSIS (RULE-BASED, AUTOMATED)");
    line("Review-priority score", `${analysis.score} points`);
    line("Review priority", analysis.level);
    line("Assessment", analysis.description);

    if (analysis.selected.length) {
      analysis.selected.forEach(rule => {
        line("Indicator explanation", `${rule.name}: ${rule.explanation}`);
        line("Review weight", `${rule.points} points`);
      });
    }

    heading("RECOMMENDED NEXT STEPS");
    analysis.actions.forEach((action, index) => {
      line(`${index + 1}`, action);
    });

    heading("EVIDENCE AND INVESTIGATOR NOTES (MANUAL)");
    line("Evidence notes", activeCase.evidenceNotes);
    line("Investigator notes", activeCase.investigatorNotes);
    line("Selected next action", activeCase.nextAction);

    heading("IMPORTANT LIMITATIONS");
    line(
      "Interpretation",
      "This rule-based score is a review-priority aid, not a probability of fraud or proof of wrongdoing."
    );
    line(
      "Verification",
      "Transaction details have not been independently verified by a bank or payment provider."
    );
    line(
      "Evidence",
      "Preserve original messages, screenshots and transaction records."
    );

    doc.save(`${activeCase.id}-UPI-report.pdf`);
    notify("UPI PDF report exported.");
  }

  return (
    <section className="panel upi-investigation" id="upi">
      <div className="panelhead">
        <div>
          <h2><ShieldCheck size={17} /> UPI fraud investigation</h2>
          <p>Record transaction details, warning signs and evidence.</p>
        </div>
        <button className="primary" onClick={createCase}>
          <Plus size={14} /> New UPI case
        </button>
      </div>

      <div className="upi-warning">
        <ShieldCheck size={17} />
        <span>
          Analysis prioritizes manual review. It does not prove that fraud
          has occurred.
        </span>
      </div>

      {cases.length > 0 && (
        <div className="upi-saved">
          <label className="fieldlabel">Saved UPI cases</label>
          <div className="upi-case-list">
            {cases.map(c => (
              <button
                key={c.id}
                className={`upi-case-option ${c.id === activeId ? "chosen" : ""}`}
                onClick={() => setActiveId(c.id)}
              >
                <b>{c.title || "Untitled UPI case"}</b>
                <small>{c.id} · {c.transactionStatus}</small>
              </button>
            ))}
          </div>
        </div>
      )}

      {!activeCase ? (
        <p className="empty">Create a UPI case to begin an investigation.</p>
      ) : (
        <>
          <div className="upi-summary">
            <div><small>Case</small><b>{activeCase.title || "Untitled"}</b><span className="mono">{activeCase.id}</span></div>
            <div><small>Amount</small><b>{fmtMoney(activeCase.amount)}</b><span>Reported loss {fmtMoney(activeCase.lossAmount)}</span></div>
            <div><small>Receiver</small><b className="mono">{activeCase.receiverUPI || "Not provided"}</b><span>{activeCase.bankApp || "App not recorded"}</span></div>
            <div><small>Status</small><b>{activeCase.transactionStatus}</b><span>{activeCase.indicators.length} indicator{activeCase.indicators.length === 1 ? "" : "s"} selected</span></div>
          </div>

          <div className="upi-layout">
            <div className="upi-form">
              <h3>Case details</h3>

              <label>
                Case title
                <input
                  value={activeCase.title}
                  onChange={e => update("title", e.target.value)}
                  placeholder="Suspected unauthorized UPI transfer"
                />
              </label>

              <h3>Transaction details</h3>

              <label>
                Transaction ID / UTR
                <input
                  value={activeCase.transactionId}
                  onChange={e => update("transactionId", e.target.value)}
                  placeholder="Transaction reference, if available"
                />
              </label>

              <div className="upi-fields">
                <label>
                  Amount (INR)
                  <input
                    type="number"
                    min="0"
                    value={activeCase.amount}
                    onChange={e => update("amount", e.target.value)}
                    placeholder="0.00"
                  />
                </label>
                <label>
                  Reported loss (INR)
                  <input
                    type="number"
                    min="0"
                    value={activeCase.lossAmount}
                    onChange={e => update("lossAmount", e.target.value)}
                    placeholder="0.00"
                  />
                </label>
              </div>

              <label>
                Transaction date and time
                <input
                  type="datetime-local"
                  value={activeCase.transactionDate}
                  onChange={e => update("transactionDate", e.target.value)}
                />
              </label>

              <div className="upi-fields">
                <label>
                  Sender UPI ID
                  <input
                    value={activeCase.senderUPI}
                    onChange={e => update("senderUPI", e.target.value)}
                    placeholder="Sender UPI ID, if known"
                  />
                </label>

                <label>
                  Receiver UPI ID
                  <input
                    value={activeCase.receiverUPI}
                    onChange={e => update("receiverUPI", e.target.value)}
                    placeholder="Receiver UPI ID, if known"
                  />
                </label>
              </div>

              <div className="upi-fields">
                <label>
                  Bank or payment app
                  <input
                    value={activeCase.bankApp}
                    onChange={e => update("bankApp", e.target.value)}
                    placeholder="Bank or payment app name"
                  />
                </label>

                <label>
                  Transaction status
                  <select
                    value={activeCase.transactionStatus}
                    onChange={e => update("transactionStatus", e.target.value)}
                  >
                    <option>Unknown</option>
                    <option>Successful</option>
                    <option>Pending</option>
                    <option>Failed</option>
                    <option>Reversed</option>
                    <option>Disputed</option>
                  </select>
                </label>
              </div>

              <h3>Potential warning indicators</h3>
              <p className="emotion-note">
                Select indicators supported by the information available.
                Verify them independently.
              </p>

              <div className="upi-indicators">
                {UPI_INDICATORS.map(indicator => (
                  <label className="upi-check" key={indicator}>
                    <input
                      type="checkbox"
                      checked={activeCase.indicators.includes(indicator)}
                      onChange={() => toggleIndicator(indicator)}
                    />
                    <span>{indicator}</span>
                  </label>
                ))}
              </div>

              <h3>Incident description and evidence</h3>

              <label>
                Incident narrative
                <textarea
                  rows="4"
                  value={activeCase.narrative}
                  onChange={e => update("narrative", e.target.value)}
                  placeholder="Describe the reported incident chronologically. Separate facts from allegations."
                />
              </label>

              <label>
                Evidence notes
                <textarea
                  rows="3"
                  value={activeCase.evidenceNotes}
                  onChange={e => update("evidenceNotes", e.target.value)}
                  placeholder="Screenshots, messages, transaction records or complaint references."
                />
              </label>

              <label>
                Investigator notes
                <textarea
                  rows="3"
                  value={activeCase.investigatorNotes}
                  onChange={e => update("investigatorNotes", e.target.value)}
                  placeholder="Observations, missing information and checks required."
                />
              </label>

              <label>
                Next action
                <select
                  value={activeCase.nextAction}
                  onChange={e => update("nextAction", e.target.value)}
                >
                  <option>Contact bank or payment app</option>
                  <option>Verify transaction with bank records</option>
                  <option>Preserve screenshots and messages</option>
                  <option>Report suspected cyber fraud</option>
                  <option>Request additional evidence</option>
                  <option>Await further information</option>
                  <option>Other - investigator review required</option>
                </select>
              </label>
            </div>

            <aside className="upi-side">
              <section className="upi-analysis" data-level={levelSlug(analysis.level)}>
                <div className="upi-analysis-heading">
                  <div>
                    <h3>Suspicious transaction analysis</h3>
                    <p>Rule-based review of the information entered</p>
                  </div>
                  <span className="upi-risk-label" data-level={levelSlug(analysis.level)}>{analysis.level}</span>
                </div>

                <div className="upi-score">
                  <span>Review-priority score</span>
                  <strong>{analysis.score}</strong>
                  <small>Points · Not a probability of fraud</small>
                </div>

                <p>{analysis.description}</p>

                <h4>Why these indicators matter</h4>
                {analysis.selected.length ? (
                  <ul>
                    {analysis.selected.map(rule => (
                      <li key={rule.name}>
                        <strong>{rule.name}</strong>
                        <p>{rule.explanation}</p>
                        <small>Review weight: {rule.points} points</small>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>
                    No warning indicators selected. This does not mean the
                    transaction is safe.
                  </p>
                )}

                <h4>Recommended next steps</h4>
                <ol>
                  {analysis.actions.map((action, index) => (
                    <li key={`${index}-${action}`}>{action}</li>
                  ))}
                </ol>

                <p className="emotion-note">
                  This assessment is based only on entered information and
                  selected indicators. It cannot verify transactions, identify
                  a criminal, or establish that fraud occurred.
                </p>
              </section>

              <div className="upi-actions">
                <button className="primary" onClick={exportPDF}>
                  <Download size={14} /> Export UPI PDF
                </button>
                <button className="secondary" onClick={deleteCase}>
                  <Trash2 size={14} /> Delete UPI case
                </button>
              </div>
            </aside>
          </div>

          <p className="emotion-note">
            UPI cases are saved in this browser. This prototype does not
            connect to bank systems or independently verify transactions.
            Never enter a UPI PIN, OTP or password.
          </p>
        </>
      )}
    </section>
  );
}

function App() {
  const initial = useRef(loadSavedCase()).current;

  const [activeNav, setActiveNav] = useState("Overview");

  function navigateTo(name, sectionId) {
    setActiveNav(name);

    if (sectionId === "overview") {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    document.getElementById(sectionId)?.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }

  const [file, setFile] = useState(null);
  const [url, setUrl] = useState("");
  const [segments, setSegments] = useState([]);
  const [selected, setSelected] = useState(0);
  const [notes, setNotes] = useState("");
  const [saved, setSaved] = useState(initial.saved || []);
  const [search, setSearch] = useState("");
  const [onlyFlagged, setOnlyFlagged] = useState(false);
  const [toast, setToast] = useState("");
  const [loading, setLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState("");
  const [language, setLanguage] = useState("");
  const [emotion, setEmotion] = useState(null);
  const [backend, setBackend] = useState("checking");
  const [upiCases, setUpiCases] = useState(loadUPICases);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [waveform, setWaveform] = useState(null);
  const [waveStatus, setWaveStatus] = useState("idle");

  const [caseTitle, setCaseTitle] = useState(
    initial.caseTitle || "Suspicious call review"
  );
  const [caseId, setCaseId] = useState(
    initial.caseId || "CM-2026-001"
  );
  const [summary, setSummary] = useState(initial.summary || "");
  const [evidence, setEvidence] = useState(
    initial.evidence || defaultEvidence
  );
  const [events, setEvents] = useState(initial.events || []);
  const [flags, setFlags] = useState(initial.flags || []);
  const [audioHash, setAudioHash] = useState(initial.audioHash || "");
  const [hashStatus, setHashStatus] = useState(
    initial.hashStatus || "No file hashed"
  );

  const audio = useRef(null);
  const picker = useRef(null);
  const waveToken = useRef(0);
  const seg = segments[selected];

  useEffect(() => {
    try {
      localStorage.setItem(CASE_KEY, JSON.stringify({
        caseTitle, caseId, summary, saved, evidence,
        events, flags, audioHash, hashStatus
      }));
    } catch {
      setToast("Browser storage is full. Export your report to keep a copy.");
    }
  }, [
    caseTitle, caseId, summary, saved, evidence,
    events, flags, audioHash, hashStatus
  ]);

  /* Highlight the sidebar item for the section currently in view. */
  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const item = NAV.find(n => n.id === entry.target.id);
            if (item) setActiveNav(item.name);
          }
        });
      },
      { rootMargin: "-25% 0px -65% 0px" }
    );

    NAV.forEach(n => {
      const el = document.getElementById(n.id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  /* Reachability check only: it does not prove the transcription model is loaded. */
  async function checkBackend() {
    setBackend("checking");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);

    try {
      await fetch(`${BACKEND_URL}/`, { mode: "no-cors", signal: controller.signal });
      setBackend("online");
    } catch {
      setBackend("offline");
    } finally {
      clearTimeout(timer);
    }
  }

  useEffect(() => {
    checkBackend();
  }, []);

  function notify(message) {
    setToast(message);
    window.setTimeout(() => setToast(""), 3500);
  }

  function pushEvent(label, detail = "") {
    setEvents(prev => [
      ...prev,
      {
        id: crypto.randomUUID(),
        time: new Date().toISOString(),
        label,
        detail
      }
    ]);
  }

  async function hashFile(f) {
    setAudioHash("");
    setHashStatus("Calculating SHA-256...");

    try {
      if (!window.crypto?.subtle) {
        setHashStatus("Hashing unavailable in this browser context");
        return;
      }

      const bytes = await f.arrayBuffer();
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      const hash = Array.from(new Uint8Array(digest))
        .map(b => b.toString(16).padStart(2, "0"))
        .join("");

      setAudioHash(hash);
      setHashStatus("SHA-256 recorded for this uploaded file");
      pushEvent("SHA-256 hash recorded", `${hash.slice(0, 16)}…`);
    } catch {
      setHashStatus("Hash calculation failed");
    }
  }

  async function computeWave(f) {
    const token = ++waveToken.current;
    setWaveform(null);
    setWaveStatus("computing");

    try {
      const peaks = await buildWaveform(f);
      if (token !== waveToken.current) return;
      if (peaks) {
        setWaveform(peaks);
        setWaveStatus("ready");
      } else {
        setWaveStatus("unavailable");
      }
    } catch {
      if (token === waveToken.current) setWaveStatus("unavailable");
    }
  }

  function upload(f) {
    if (!f) return;

    if (!f.type.startsWith("audio/") &&
        !/\.(wav|mp3|m4a|ogg|flac|webm|aac)$/i.test(f.name)) {
      notify("Please choose a supported audio file.");
      return;
    }

    if (url) URL.revokeObjectURL(url);

    setFile(f);
    setUrl(URL.createObjectURL(f));
    setSegments([]);
    setSelected(0);
    setLanguage("");
    setEmotion(null);
    setAnalysisError("");
    setDuration(0);
    setCurrentTime(0);

    setEvidence(prev => prev.map(item =>
      item.id === 1 ? { ...item, status: "collected" } : item
    ));

    pushEvent("Audio uploaded", f.name);

    hashFile(f);
    computeWave(f);
    notify("Audio loaded. Run analysis when ready.");
  }

  async function analyze() {
    if (!file) {
      notify("Please upload an audio file first.");
      picker.current?.click();
      return;
    }

    setLoading(true);
    setSegments([]);
    setEmotion(null);
    setAnalysisError("");
    pushEvent("Transcription requested", file.name);
    notify("Analyzing audio. The first model run may take longer.");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(
        `${BACKEND_URL}/transcribe`,
        { method: "POST", body: formData }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Analysis failed.");
      }

      const actualSegments = (data.segments || []).map((item, index) => ({
        start: item.start,
        end: item.end,
        text: item.text,
        id: index
      }));

      setSegments(actualSegments);
      setSelected(0);
      setLanguage(data.language || "Unknown");
      setEmotion(data.emotion || null);
      setBackend("online");

      setEvents(prev => [
        ...prev,
        {
          id: crypto.randomUUID(),
          time: new Date().toISOString(),
          label: "Audio analysis completed",
          detail: `${actualSegments.length} transcript segments; detected language: ${data.language || "unknown"}`
        }
      ]);

      notify(data.emotion?.status === "completed"
        ? "Transcription and emotion analysis completed."
        : "Transcription completed. Emotion analysis needs checking.");
    } catch (error) {
      const message = error instanceof TypeError
        ? "Could not reach the backend at 127.0.0.1:8000. Start the Python server and try again."
        : error.message;
      if (error instanceof TypeError) setBackend("offline");
      setAnalysisError(message);
      pushEvent("Audio analysis failed", message);
      notify("Analysis failed: " + message);
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

  function seekTo(seconds) {
    if (audio.current && Number.isFinite(seconds)) {
      audio.current.currentTime = Math.max(0, Math.min(seconds, duration || seconds));
    }
  }

  function onWaveClick(e) {
    if (!duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    seekTo(((e.clientX - rect.left) / rect.width) * duration);
  }

  function onWaveKey(e) {
    if (e.key === "ArrowRight") { e.preventDefault(); seekTo(currentTime + 5); }
    if (e.key === "ArrowLeft") { e.preventDefault(); seekTo(currentTime - 5); }
  }

  function addNote() {
    if (!notes.trim()) {
      notify("Write a note first.");
      return;
    }

    const note = {
      id: crypto.randomUUID(),
      text: notes.trim(),
      time: seg?.start || 0,
      createdAt: new Date().toISOString()
    };

    setSaved(prev => [...prev, note]);
    pushEvent("Investigator note added", note.text);

    setNotes("");
    notify("Note saved in this browser.");
  }

  function toggleFlag(segment, index) {
    const exists = flags.some(f => f.segmentId === index);

    if (exists) {
      setFlags(prev => prev.filter(f => f.segmentId !== index));
      pushEvent("Segment unflagged", `${time(segment.start)}–${time(segment.end)}`);
      notify("Review flag removed.");
    } else {
      setFlags(prev => [...prev, {
        id: crypto.randomUUID(),
        segmentId: index,
        start: segment.start,
        end: segment.end,
        text: segment.text,
        reason: "Needs manual verification"
      }]);
      pushEvent("Segment flagged for review", `${time(segment.start)}–${time(segment.end)}`);
      notify("Segment flagged for review.");
    }
  }

  function updateEvidence(id, status) {
    setEvidence(prev => prev.map(item =>
      item.id === id ? { ...item, status } : item
    ));
  }

  function addEvent() {
    const label = window.prompt("Enter the incident event:");
    if (!label?.trim()) return;
    const detail = window.prompt("Add details (optional):") || "";

    pushEvent(label.trim(), detail.trim());
    notify("Timeline event added.");
  }

  function removeEvent(id) {
    setEvents(prev => prev.filter(event => event.id !== id));
  }

  async function copyHash() {
    if (!audioHash) return;
    try {
      await navigator.clipboard.writeText(audioHash);
      notify("SHA-256 hash copied.");
    } catch {
      notify("Copy is not available here. Select the hash and copy it manually.");
    }
  }

  function report() {
    const confidence = Number.isFinite(emotion?.confidence)
      ? `${(emotion.confidence * 100).toFixed(2)}%`
      : "Unavailable";

    const content = [
      "CYBERMITRA — AUDIO INVESTIGATION REPORT",
      `Case ID: ${caseId}`,
      `Case title: ${caseTitle}`,
      `Exported: ${new Date().toLocaleString()}`,
      "",
      "CASE SUMMARY (INVESTIGATOR-ENTERED)",
      summary || "No summary entered.",
      "",
      "SOURCE AUDIO",
      `Filename: ${file?.name || "Not available in this session"}`,
      `File size: ${file ? `${(file.size / 1048576).toFixed(2)} MB` : "Unavailable"}`,
      `SHA-256: ${audioHash || "Unavailable"}`,
      `Hash status: ${hashStatus}`,
      `Detected language (backend): ${language || "Not analyzed"}`,
      "",
      "TRANSCRIPT (AUTOMATED, BACKEND)",
      ...segments.map(s => `[${time(s.start)}–${time(s.end)}] ${s.text}`),
      "",
      "VOICE EMOTION MODEL (AUTOMATED, BACKEND)",
      `Predicted label: ${emotion?.label || "Unavailable"}`,
      `Model confidence score: ${confidence}`,
      `Status: ${emotion?.status || "Unavailable"}`,
      "",
      "SPEAKER VERIFICATION AND ANTI-SPOOFING",
      "Voiceprint matching: Not run (no backend integration connected).",
      "Synthetic-audio / anti-spoofing detection: Not run (no backend integration connected).",
      "",
      "IMPORTANT AI LIMITATIONS",
      "Emotion is a model-estimated vocal classification, not proof of actual emotion, truthfulness, guilt, intent, or victim status.",
      "The emotion model has not been validated here for Hindi predictions.",
      "Model confidence is not the probability that a person is telling the truth.",
      "Verify all findings against the original recording and independent evidence.",
      "",
      "EVIDENCE CHECKLIST (INVESTIGATOR-UPDATED)",
      ...evidence.map(item => `[${item.status.toUpperCase()}] ${item.name}`),
      "",
      "REVIEW FLAGS (INVESTIGATOR-ENTERED)",
      ...(flags.length
        ? flags.map(f => `[${time(f.start)}–${time(f.end)}] ${f.reason}: ${f.text}`)
        : ["No transcript segments flagged."]),
      "",
      "INVESTIGATOR NOTES (INVESTIGATOR-ENTERED)",
      ...(saved.length
        ? saved.map(n => `[${time(n.time)}] ${n.text}`)
        : ["No notes recorded."]),
      "",
      "INCIDENT TIMELINE",
      ...events.map(e =>
        `[${fmtDate(e.time)}] ${e.label}${e.detail ? ": " + e.detail : ""}`
      ),
      "",
      "INTEGRITY NOTE",
      "The SHA-256 hash identifies the bytes of the uploaded file at the time of hashing. It does not establish the recording's origin, chain of custody, or authenticity before upload."
    ].join("\n");

    const blobUrl = URL.createObjectURL(
      new Blob([content], { type: "text/plain;charset=utf-8" })
    );

    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = `${caseId || "cybermitra"}-report.txt`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    pushEvent("Audio report exported", `${caseId || "cybermitra"}-report.txt`);
    notify("Audio investigation report exported.");
  }

  const filtered = segments
    .map((s, i) => ({ ...s, i }))
    .filter(s => (s.text || "").toLowerCase().includes(search.toLowerCase()))
    .filter(s => !onlyFlagged || flags.some(f => f.segmentId === s.i));

  const confidenceAvailable = Number.isFinite(emotion?.confidence);
  const confidencePercent = confidenceAvailable
    ? `${(emotion.confidence * 100).toFixed(1)}%`
    : "Unavailable";

  const emotionStatus = emotion?.status === "completed"
    ? "Analysis completed"
    : emotion?.status === "failed"
      ? "Analysis failed"
      : "Awaiting analysis";

  const collectedCount = evidence.filter(e => e.status === "collected").length;
  const pendingCount = evidence.filter(e => e.status === "pending").length;
  const evidencePct = evidence.length ? (collectedCount / evidence.length) * 100 : 0;

  const audioStatus = loading
    ? "Analysis running"
    : !file
      ? "No audio loaded"
      : segments.length
        ? "Transcript ready"
        : analysisError
          ? "Analysis failed"
          : "Analysis pending";

  const highPriorityCases = upiCases.filter(
    c => analyzeUPICase(c)?.level.startsWith("High")
  ).length;

  const timelineItems = [
    ...events.map(e => ({ ...e, source: "Audio case" })),
    ...upiCases
      .filter(c => c.createdAt)
      .map(c => ({
        id: `upi-${c.id}`,
        time: c.createdAt,
        label: "UPI case created",
        detail: `${c.title || "Untitled"} (${c.id})`,
        source: "UPI",
        readonly: true
      }))
  ].sort((a, b) => (new Date(a.time).getTime() || 0) - (new Date(b.time).getTime() || 0));

  const notPerformed = [
    "Voiceprint / speaker match: not connected",
    "Synthetic-audio detection: not connected",
    ...evidence
      .filter(e => [2, 3, 4].includes(e.id) && e.status === "pending")
      .map(e => `${e.name}: pending`)
  ];

  const MAX_UPI_SCORE = Object.values(UPI_INDICATOR_RULES).reduce((t, r) => t + r.points, 0);

  const upiScores = upiCases.slice(0, 8).map(c => {
    const a = analyzeUPICase(c);
    return { id: c.id, title: c.title || "Untitled case", score: a.score, slug: levelSlug(a.level) };
  });

  const unavailableCount = evidence.filter(e => e.status === "unavailable").length;
  const donutParts = [
    { key: "collected", label: "Collected", value: collectedCount, color: "#39dfac" },
    { key: "pending", label: "Pending", value: pendingCount, color: "#ffb547" },
    { key: "unavailable", label: "Unavailable", value: unavailableCount, color: "#6f8fa1" }
  ];
  const DONUT_R = 40;
  const DONUT_C = 2 * Math.PI * DONUT_R;
  let donutOffset = 0;
  const donutArcs = donutParts.filter(p => p.value > 0).map(p => {
    const len = (p.value / Math.max(1, evidence.length)) * DONUT_C;
    const arc = { ...p, len, offset: donutOffset };
    donutOffset += len;
    return arc;
  });

  const progress = duration ? Math.min(1, currentTime / duration) : 0;

  const backendLabel = backend === "online"
    ? "Backend reachable"
    : backend === "offline"
      ? "Backend not reachable"
      : "Checking backend";

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon"><AudioLines /></div>
          <div><b>CyberMitra <em>AI</em></b><small>Digital evidence workspace</small></div>
        </div>

        <label>Workspace</label>
        {NAV.map(item => {
          const Icon = item.icon;
          const count = item.id === "upi" ? upiCases.length : item.id === "timeline" ? timelineItems.length : null;
          return (
            <button
              key={item.id}
              type="button"
              className={`nav ${activeNav === item.name ? "active" : ""}`}
              onClick={() => navigateTo(item.name, item.id)}
            >
              <Icon size={17} />
              <span className="nav-label">{item.name}</span>
              {count !== null && <span className="nav-count">{count}</span>}
            </button>
          );
        })}

        <div className="side-case">
          <small>● Active case</small>
          <b>{caseTitle}</b>
          <p className="mono">{caseId}</p>
          <div className="progress"><i style={{ width: `${evidencePct}%` }} /></div>
          <small>Evidence items <strong>{collectedCount}/{evidence.length}</strong></small>
        </div>

        <div className="side-bottom"><LockKeyhole size={14} /> Local prototype workspace</div>
      </aside>

      <main>
        <header>
          <div className="crumbs">Investigations <ChevronRight size={14} /> <b>{caseId}</b></div>
          <div className="headstatus">
            <span className="chip" data-tone={backend === "online" ? "ok" : backend === "offline" ? "bad" : "idle"}>
              {backend === "offline" ? <WifiOff size={13} /> : <Wifi size={13} />} {backendLabel}
            </span>
            <button className="iconbtn" onClick={checkBackend} title="Re-check backend connection" aria-label="Re-check backend connection">
              <RefreshCw size={14} />
            </button>
            <span className="chip" data-tone={loading ? "info" : audioStatus === "Transcript ready" ? "ok" : audioStatus === "Analysis failed" ? "bad" : "warn"}>
              <ShieldCheck size={13} /> {audioStatus}
            </span>
            <button className="secondary small" onClick={report}>
              <Download size={13} /> Export report
            </button>
          </div>
        </header>

        <nav className="mobilenav" aria-label="Sections">
          {NAV.map(item => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                className={activeNav === item.name ? "active" : ""}
                onClick={() => navigateTo(item.name, item.id)}
              >
                <Icon size={14} /> {item.short}
              </button>
            );
          })}
        </nav>

        {/* ---------- OVERVIEW ---------- */}
        <section className="heading" id="overview">
          <div>
            <small className="eyebrow">Investigation workspace</small>
            <h1>Audio and UPI evidence review</h1>
            <p>Transcribe recordings, check transactions and organize evidence for manual review.</p>
          </div>
        </section>

        <div className="metrics">
          <article>
            <small>Saved UPI cases</small>
            <b>{upiCases.length}</b>
            <p>{upiCases.length ? `${highPriorityCases} with high review priority` : "No UPI cases yet"}</p>
          </article>
          <article>
            <small>Audio processing</small>
            <b>{audioStatus}</b>
            <p>{file ? `${file.name} · ${(file.size / 1048576).toFixed(2)} MB` : "Upload a recording to begin"}</p>
          </article>
          <article>
            <small>Transcript segments</small>
            <b>{segments.length || "N/A"}</b>
            <p>{language ? `Detected language: ${language}` : "Waiting for analysis"}</p>
          </article>
          <article>
            <small>Flagged segments</small>
            <b>{flags.length}</b>
            <p>Marked by the investigator</p>
          </article>
          <article>
            <small>Evidence hash</small>
            <b>{audioHash ? "Available" : "Not available"}</b>
            <p>{hashStatus}</p>
          </article>
          <article>
            <small>Pending checks</small>
            <b>{pendingCount}</b>
            <p>{collectedCount} of {evidence.length} checklist items collected</p>
          </article>
        </div>

        <section className="panel analytics">
          <div className="panelhead">
            <div>
              <h2><Activity size={17} /> Investigation analytics</h2>
              <p>Calculated from the UPI cases and checklist saved in this browser.</p>
            </div>
          </div>

          <div className="charts">
            <div className="chart">
              <h3>UPI review-priority score by case</h3>
              {upiScores.length ? (
                <>
                  <div className="hbars">
                    {upiScores.map(c => (
                      <div className="hbar" key={c.id}>
                        <span className="hbar-label" title={`${c.title} (${c.id})`}>{c.title}</span>
                        <div className="hbar-track">
                          <i data-level={c.slug} style={{ width: `${(c.score / MAX_UPI_SCORE) * 100}%` }} />
                          <u style={{ left: `${(4 / MAX_UPI_SCORE) * 100}%` }} />
                          <u style={{ left: `${(7 / MAX_UPI_SCORE) * 100}%` }} />
                        </div>
                        <b className="mono">{c.score}</b>
                      </div>
                    ))}
                  </div>
                  <p className="chart-note">
                    Points from the rule-based score (maximum {MAX_UPI_SCORE}). Vertical lines mark the moderate (4) and high (7) review thresholds. This is not a probability of fraud.
                  </p>
                </>
              ) : (
                <p className="empty">Create a UPI case to see its score here.</p>
              )}
            </div>

            <div className="chart">
              <h3>Evidence checklist status</h3>
              <div className="donutwrap">
                <svg viewBox="0 0 100 100" className="donut" role="img"
                  aria-label={`${collectedCount} collected, ${pendingCount} pending, ${unavailableCount} unavailable`}>
                  <circle cx="50" cy="50" r={DONUT_R} fill="none" stroke="#143447" strokeWidth="11" />
                  {donutArcs.map(a => (
                    <circle
                      key={a.key}
                      cx="50" cy="50" r={DONUT_R}
                      fill="none"
                      stroke={a.color}
                      strokeWidth="11"
                      strokeDasharray={`${a.len} ${DONUT_C - a.len}`}
                      strokeDashoffset={-a.offset}
                      transform="rotate(-90 50 50)"
                    />
                  ))}
                  <text x="50" y="49" textAnchor="middle" className="donut-num">{collectedCount}/{evidence.length}</text>
                  <text x="50" y="62" textAnchor="middle" className="donut-sub">collected</text>
                </svg>
                <ul className="donut-legend">
                  {donutParts.map(p => (
                    <li key={p.key}><i style={{ background: p.color }} /> {p.label} <b className="mono">{p.value}</b></li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        <section className="casebar">
          <div className="caseicon"><FileAudio /></div>
          <div className="caseinfo">
            <b>{caseTitle}</b>
            <small><span className="mono">{caseId}</span> · <Clock3 size={12} /> Local prototype · <LockKeyhole size={12} /> Restricted</small>
          </div>
          <button className="primary" onClick={() => picker.current?.click()}><Plus size={15} /> Upload audio</button>
          <input ref={picker} hidden type="file" accept="audio/*"
            onChange={e => { upload(e.target.files[0]); e.target.value = ""; }} />
        </section>

        <section className="panel case-editor">
          <div className="panelhead">
            <div><h2><FolderOpen size={17} /> Case details</h2><p>Changes save in this browser.</p></div>
            <small className="tag">Investigator-entered</small>
          </div>
          <div className="case-fields">
            <label>Case ID<input value={caseId} onChange={e => setCaseId(e.target.value)} /></label>
            <label>Case title<input value={caseTitle} onChange={e => setCaseTitle(e.target.value)} /></label>
          </div>
          <label className="fieldlabel">Case summary</label>
          <textarea rows="4" value={summary} onChange={e => setSummary(e.target.value)}
            placeholder="Record a neutral summary of the reported incident. Separate verified facts from allegations and unknown details." />
        </section>

        {/* ---------- UPI ---------- */}
        <div className="section-gap" />
        <UPIInvestigation notify={notify} onCasesChange={setUpiCases} />

        {/* ---------- AUDIO FORENSICS ---------- */}
        <section className="sectionhead" id="audio">
          <div>
            <small className="eyebrow">Audio forensics</small>
            <h2>Recording analysis</h2>
            <p>Observed content, automated results and investigator conclusions are kept separate.</p>
          </div>
        </section>

        <div className="grid">
          <div className="left">
            <section className="panel">
              <div className="panelhead"><div><h2><Headphones size={17} /> Audio evidence player</h2><p>Listen to the original recording</p></div><small className="tag">Original file</small></div>
              <div className="audiofile">
                <div className="fileicon"><AudioLines /></div>
                <div><b>{file ? file.name : "No audio selected"}</b><small>{file ? `${(file.size / 1048576).toFixed(2)} MB · ${file.type || "type unknown"}${duration ? ` · ${time(duration)}` : ""}` : "Choose an audio file"}</small></div>
                <button className="iconbtn" onClick={() => picker.current?.click()} title="Upload audio" aria-label="Upload audio"><UploadCloud size={17} /></button>
              </div>

              <div className="wavebox">
                {waveform ? (
                  <div
                    className="wave"
                    role="slider"
                    tabIndex={0}
                    aria-label="Audio position"
                    aria-valuemin={0}
                    aria-valuemax={Math.round(duration)}
                    aria-valuenow={Math.round(currentTime)}
                    onClick={onWaveClick}
                    onKeyDown={onWaveKey}
                  >
                    {waveform.map((h, i) => (
                      <i key={i} className={i / waveform.length < progress ? "played" : ""} style={{ height: `${Math.round(h * 100)}%` }} />
                    ))}
                    {duration > 0 && flags.map(f => (
                      <span key={f.id} className="wave-mark" title={`Flagged ${time(f.start)}–${time(f.end)}`}
                        style={{ left: `${(f.start / duration) * 100}%`, width: `${Math.max(0.6, ((f.end - f.start) / duration) * 100)}%` }} />
                    ))}
                    <span className="wave-head" style={{ left: `${progress * 100}%` }} />
                  </div>
                ) : (
                  <p className="empty wave-empty">
                    {waveStatus === "computing"
                      ? "Computing waveform from the uploaded file…"
                      : waveStatus === "unavailable"
                        ? "Waveform unavailable for this file (unsupported codec, very large file or no Web Audio support)."
                        : "The waveform is computed from the audio you upload."}
                  </p>
                )}
                <div className="wave-times mono"><span>{time(currentTime)}</span><span>{duration ? time(duration) : "--:--"}</span></div>
              </div>

              {url && (
                <audio
                  ref={audio}
                  controls
                  src={url}
                  onLoadedMetadata={e => setDuration(e.currentTarget.duration || 0)}
                  onTimeUpdate={e => setCurrentTime(e.currentTarget.currentTime)}
                />
              )}
              <div className="audiobottom"><small>● {file ? "Original file loaded" : "Waiting for upload"}</small><button onClick={() => picker.current?.click()}>Replace audio</button></div>
              <div className="notice">
                <div><b>{loading ? "Analyzing recording..." : "Ready to analyze?"}</b><small>Transcription and voice classification run on your Python backend.</small></div>
                <button className="primary" onClick={analyze} disabled={loading}><Sparkles size={14} />{loading ? "Analyzing..." : "Run analysis"}</button>
              </div>
              {analysisError && <div className="errorbox" role="alert"><ShieldAlert size={15} /> {analysisError}</div>}
            </section>

            <section className="panel">
              <div className="panelhead"><div><h2><Activity size={17} /> Transcript timeline</h2><p>Select a segment to replay or flag it for review</p></div><small className="tag">Automated</small></div>
              {segments.length ? <>
                <div className="timeline">
                  {segments.map((s, i) => {
                    const flagged = flags.some(f => f.segmentId === i);
                    return (
                      <button key={i} className={`${flagged ? "amber" : "blue"}${selected === i ? " selected" : ""}`} onClick={() => jump(s, i)}>
                        <b>{time(s.start)}</b><small>{flagged ? "Flagged" : `Segment ${i + 1}`}</small>
                      </button>
                    );
                  })}
                </div>
                {seg && <div className="selected">
                  <span className={`badge ${flags.some(f => f.segmentId === selected) ? "amber" : "blue"}`}>{flags.some(f => f.segmentId === selected) ? "Flagged" : "Speech"}</span>
                  <div><b>{time(seg.start)} – {time(seg.end)}</b><p>{seg.text}</p></div>
                  <button className="secondary small" onClick={() => jump(seg, selected)}><Play size={12} /> Replay</button>
                  <button className="secondary small" onClick={() => toggleFlag(seg, selected)}><Flag size={12} />{flags.some(f => f.segmentId === selected) ? "Unflag" : "Flag"}</button>
                </div>}
              </> : <p className="empty">{loading ? "Analyzing recording. Segments will appear here." : "Upload audio and run analysis to generate the transcript timeline."}</p>}
              <p className="disclaimer">Transcription can make mistakes. Verify important details against the original recording.</p>
            </section>

            <section className="panel">
              <div className="panelhead"><div><h2><Search size={17} /> Transcript</h2><p>Search recognized speech</p></div><small className="tag">Automated</small></div>
              <div className="searchrow">
                <div className="search"><Search size={14} /><input placeholder="Search transcript..." value={search} onChange={e => setSearch(e.target.value)} aria-label="Search transcript" /></div>
                <button className={`secondary small togglebtn ${onlyFlagged ? "on" : ""}`} onClick={() => setOnlyFlagged(v => !v)} aria-pressed={onlyFlagged}>
                  <Flag size={12} /> Flagged only
                </button>
              </div>
              <div className="transcripts">
                {filtered.map(s => {
                  const flagged = flags.some(f => f.segmentId === s.i);
                  return (
                    <button key={s.i} className={`${selected === s.i ? "chosen" : ""}${flagged ? " flagged" : ""}`} onClick={() => jump(s, s.i)}>
                      <small>{time(s.start)}</small>
                      <span>{s.text}
                        <em className={flagged ? "amber" : "blue"}>{flagged ? "Flagged for review" : "Transcribed"}</em>
                      </span>
                    </button>
                  );
                })}
                {!filtered.length && <p className="empty">
                  {segments.length
                    ? "No segments match the current search or filter."
                    : loading ? "Analyzing recording..." : "Transcript will appear here after analysis."}
                </p>}
              </div>
              <footer>{segments.length} segments <span>{language ? `Language: ${language}` : "No transcript yet"}</span></footer>
            </section>
          </div>

          <div className="right">
            <section className="panel">
              <div className="panelhead"><div><h2><Activity size={17} /> Voice emotion report</h2><p>Prediction for the complete recording</p></div><small className="tag">Backend model</small></div>
              <div className="emotion-result"><div className="emotion-symbol"><AudioLines size={24} /></div>
                <div className="emotion-main"><small>Predicted emotion</small><h3>{loading ? "Analyzing..." : emotion?.label || "Not analyzed"}</h3><p>{emotionStatus}</p></div>
              </div>
              <div className="emotion-confidence"><div><span>Model confidence score</span><b>{confidencePercent}</b></div>
                <div className="confidence-track"><div className="confidence-fill" style={{ width: confidenceAvailable ? `${Math.max(0, Math.min(100, emotion.confidence * 100))}%` : "0%" }} /></div>
              </div>
              <p className="emotion-note">This is a model-estimated vocal classification, not proof of actual emotion, honesty, guilt, intent or victim status. Hindi predictions have not been validated for this model.</p>
            </section>

            <section className="panel">
              <div className="panelhead"><div><h2><ClipboardCheck size={17} /> Findings summary</h2><p>Where each finding comes from</p></div></div>
              <div className="findings">
                <div className="finding" data-kind="observed">
                  <small>Observed transcript</small>
                  <p>{segments.length ? `${segments.length} segments recognized${language ? ` in ${language}` : ""}.` : "No transcript yet."}</p>
                </div>
                <div className="finding" data-kind="auto">
                  <small>Automated (backend)</small>
                  <p>{emotion?.label ? `Emotion label “${emotion.label}” at ${confidencePercent} model confidence. Not proof of intent.` : "No automated results yet."}</p>
                </div>
                <div className="finding" data-kind="manual">
                  <small>Investigator</small>
                  <p>{flags.length} flagged segment{flags.length === 1 ? "" : "s"} · {saved.length} note{saved.length === 1 ? "" : "s"} recorded.</p>
                </div>
                <div className="finding" data-kind="todo">
                  <small>Not yet performed</small>
                  <ul>{notPerformed.map(n => <li key={n}>{n}</li>)}</ul>
                </div>
              </div>
            </section>

            <section className="panel">
              <div className="panelhead"><div><h2><Mic size={17} /> Voiceprint and anti-spoofing</h2><p>Speaker verification and synthetic-audio checks</p></div><small className="tag" data-tone="warn">Not connected</small></div>
              <div className="verif">
                <div>
                  <b>Voiceprint match</b>
                  <span className="chip" data-tone="idle">Analysis not run</span>
                  <p>No speaker-verification service is connected, so no match result exists. A reference voice sample and a speaker-embedding model on the backend would be required.</p>
                </div>
                <div>
                  <b>Synthetic-audio detection</b>
                  <span className="chip" data-tone="idle">Analysis not run</span>
                  <p>No anti-spoofing model is connected. A backend endpoint returning a spoof-detection label and score would be required before this can show a result.</p>
                </div>
              </div>
              <button className="secondary full" disabled title="Requires backend integration">Run voice checks (not available)</button>
            </section>

            <section className="panel">
              <div className="panelhead"><div><h2><FileText size={17} /> Investigator notes</h2><p>Observations are saved in this browser</p></div><small className="tag">{saved.length}</small></div>
              <label className="fieldlabel">Note for {seg ? time(seg.start) : "00:00"} segment</label>
              <textarea rows="3" placeholder="Write a neutral observation..." value={notes} onChange={e => setNotes(e.target.value)} />
              <button className="primary full" onClick={addNote}><Plus size={14} /> Add note</button>
              <div className="saved">
                {saved.map(n => <div key={n.id}><small>{time(n.time)}</small><p>{n.text}</p></div>)}
                {!saved.length && <p className="empty">No notes recorded yet.</p>}
              </div>
            </section>

            <section className="panel">
              <div className="panelhead"><div><h2><Flag size={17} /> Review flags</h2><p>Transcript sections requiring human review</p></div><small className="tag">{flags.length}</small></div>
              <div className="flaglist">
                {flags.map(f => <div className="review-flag" key={f.id}>
                  <div><b>{time(f.start)}–{time(f.end)}</b><p>{f.text}</p><small>{f.reason}</small></div>
                  <button className="iconbtn" onClick={() => setFlags(prev => prev.filter(x => x.id !== f.id))} title="Remove flag" aria-label="Remove flag"><Trash2 size={15} /></button>
                </div>)}
              </div>
              {!flags.length && <p className="empty">Select a transcript segment and choose Flag to add one.</p>}
            </section>
          </div>
        </div>

        {/* ---------- EVIDENCE INTEGRITY ---------- */}
        <section className="sectionhead" id="integrity">
          <div>
            <small className="eyebrow">Evidence integrity</small>
            <h2>File integrity and checklist</h2>
            <p>A hash supports file comparison. It does not prove authenticity or chain of custody.</p>
          </div>
        </section>

        <div className="twocol">
          <section className="panel">
            <div className="panelhead"><div><h2><Fingerprint size={17} /> Evidence integrity</h2><p>SHA-256 of the selected audio file</p></div><small className="tag">File hash</small></div>
            <dl className="facts">
              <div><dt>Original filename</dt><dd>{file ? file.name : "Not available in this session"}</dd></div>
              <div><dt>File size</dt><dd>{file ? `${(file.size / 1048576).toFixed(2)} MB` : "N/A"}</dd></div>
              <div><dt>Media type</dt><dd>{file ? (file.type || "Unknown") : "N/A"}</dd></div>
              <div><dt>Last modified (file)</dt><dd>{file?.lastModified ? new Date(file.lastModified).toLocaleString() : "N/A"}</dd></div>
              <div><dt>Hash status</dt><dd>{hashStatus}</dd></div>
              <div><dt>Processing status</dt><dd>{audioStatus}</dd></div>
              <div><dt>Checklist</dt><dd>{collectedCount} of {evidence.length} collected</dd></div>
              <div><dt>Chain of custody</dt><dd>No custody workflow implemented</dd></div>
            </dl>
            <div className="hash-value">{audioHash || "Upload an audio file to calculate its hash."}</div>
            <div className="hashactions">
              <button className="secondary small" onClick={copyHash} disabled={!audioHash}>Copy hash</button>
            </div>
            <p className="emotion-note">Keep the original file unchanged. A matching hash helps compare file bytes; it does not prove the recording's origin or earlier chain of custody.</p>
          </section>

          <section className="panel">
            <div className="panelhead"><div><h2><ClipboardCheck size={17} /> Evidence checklist</h2><p>Update each item's review status</p></div><small className="tag">{collectedCount}/{evidence.length}</small></div>
            <div className="evidence-list">
              {evidence.map(item => <div className="evidence-item" key={item.id}>
                <span>{item.name}</span>
                <select value={item.status} data-status={item.status} onChange={e => updateEvidence(item.id, e.target.value)} aria-label={`Status for ${item.name}`}>
                  <option value="pending">Pending</option>
                  <option value="collected">Collected</option>
                  <option value="unavailable">Unavailable</option>
                </select>
              </div>)}
            </div>
          </section>
        </div>

        {/* ---------- TIMELINE ---------- */}
        <section className="sectionhead" id="timeline">
          <div>
            <small className="eyebrow">Investigation timeline</small>
            <h2>What happened, in order</h2>
            <p>Events are recorded as they occur in this browser. Nothing is back-filled.</p>
          </div>
        </section>

        <section className="panel">
          <div className="panelhead"><div><h2><Clock3 size={17} /> Incident timeline</h2><p>Uploaded, analyzed and manually entered events</p></div><button className="secondary small" onClick={addEvent}><Plus size={12} /> Add event</button></div>
          <div className="event-list">
            {timelineItems.map(e => <div className="event-item" key={e.id}>
              <div><b>{e.label}</b> <span className="srcpill">{e.source}</span><time>{fmtDate(e.time)}</time>{e.detail && <p>{e.detail}</p>}</div>
              {!e.readonly && <button className="iconbtn" onClick={() => removeEvent(e.id)} title="Remove event" aria-label="Remove event"><Trash2 size={14} /></button>}
            </div>)}
            {!timelineItems.length && <p className="empty">Events will appear here as you work.</p>}
          </div>
        </section>

        {/* ---------- REPORTS ---------- */}
        <section className="sectionhead" id="reports">
          <div>
            <small className="eyebrow">Reports</small>
            <h2>Export findings</h2>
            <p>Reports label automated results and investigator entries separately.</p>
          </div>
        </section>

        <div className="twocol">
          <section className="panel">
            <div className="panelhead"><div><h2><FileText size={17} /> Audio investigation report</h2><p>Plain-text export</p></div><small className="tag">.txt</small></div>
            <ul className="checks">
              <li data-ok={!!file}>Source audio {file ? "loaded" : "not loaded"}</li>
              <li data-ok={!!audioHash}>SHA-256 {audioHash ? "recorded" : "not available"}</li>
              <li data-ok={segments.length > 0}>Transcript {segments.length ? "available" : "not available"}</li>
              <li data-ok={saved.length > 0}>{saved.length} investigator note{saved.length === 1 ? "" : "s"}</li>
            </ul>
            <button className="primary full" onClick={report}><Download size={14} /> Export audio report</button>
          </section>

          <section className="panel">
            <div className="panelhead"><div><h2><ShieldCheck size={17} /> UPI case report</h2><p>PDF export for the selected UPI case</p></div><small className="tag">.pdf</small></div>
            <p className="emotion-note">Each UPI case exports its own PDF from the UPI investigation section, including the rule-based analysis and limitations.</p>
            <button className="secondary full" onClick={() => navigateTo("UPI Fraud Investigation", "upi")}>Go to UPI investigation</button>
          </section>
        </div>

        <footer className="pagefoot">CyberMitra <b>Prototype</b><span>AI results require independent human verification</span></footer>
      </main>

      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
