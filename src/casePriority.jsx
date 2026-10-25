import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, ArrowDownWideNarrow, CalendarClock, Check, ChevronRight,
  Clock3, FileSearch, Filter, Info, Search, ShieldAlert, ShieldCheck,
  UserRound, X
} from "lucide-react";
import { assessCasePriority, getEffectivePriority } from "./casePriorityEngine.js";
import { CASE_STORE_UPDATED_EVENT, PRIORITY_CASES_KEY } from "./caseStore.js";

const PRIORITY_ORDER = { Critical: 0, High: 1, Medium: 2, Low: 3 };
const PRIORITIES = ["Critical", "High", "Medium", "Low"];
const STATUSES = ["New", "Triage", "Investigating", "Awaiting evidence", "Awaiting follow-up", "Closed"];

const DEMO_CASES = [
  {
    id: "CM-2026-1042", complaintType: "UPI fraud", reportedAt: "2026-10-24T09:20:00+05:30", loss: 48500,
    indicators: ["Recent transfer", "Recipient account review requested"], evidenceStatus: "Payment reference recorded",
    evidence: ["DEMO-UPI-1042-A · payment confirmation", "DEMO-UPI-1042-B · reporting summary"],
    officer: "Investigator A", status: "Awaiting follow-up", followUpDue: "2026-10-25T06:00:00+05:30",
    description: "A fictional complainant reports an unauthorized UPI transfer and says the recipient account may still be active. No account identifiers are included in this demo.",
    priorityFactors: { safetyConcern: false, timeSensitiveFraud: true, ongoingActivity: true, affectedVictims: 1, evidenceUrgency: true, pendingAction: true },
    timeline: [["2026-10-24T09:20:00+05:30", "Report received"], ["2026-10-24T10:05:00+05:30", "Payment reference noted"], ["2026-10-24T12:30:00+05:30", "Provider follow-up requested"]]
  },
  {
    id: "CM-2026-1043", complaintType: "Cyberstalking", reportedAt: "2026-10-23T16:40:00+05:30", loss: null,
    indicators: ["Repeated unwanted contact", "Immediate safety concern"], evidenceStatus: "Preservation required",
    evidence: ["DEMO-STK-1043-A · message export reference", "DEMO-STK-1043-B · incident log reference"],
    officer: "Investigator B", status: "Investigating", followUpDue: "2026-10-25T08:00:00+05:30",
    description: "A fictional report describes repeated unwanted contact and an immediate concern for personal safety. The reporting person requested a prompt safety check.",
    priorityFactors: { safetyConcern: true, timeSensitiveFraud: false, ongoingActivity: true, affectedVictims: 1, evidenceUrgency: true, pendingAction: true },
    timeline: [["2026-10-23T16:40:00+05:30", "Report received"], ["2026-10-23T17:10:00+05:30", "Safety concern flagged for human review"]]
  },
  {
    id: "CM-2026-1044", complaintType: "Online blackmail", reportedAt: "2026-10-22T11:15:00+05:30", loss: null,
    indicators: ["Threat of continued publication", "Multiple accounts involved"], evidenceStatus: "Platform records pending",
    evidence: ["DEMO-BLK-1044-A · platform report reference", "DEMO-BLK-1044-B · URL capture reference"],
    officer: "Investigator C", status: "Awaiting evidence", followUpDue: "2026-10-26T12:00:00+05:30",
    description: "A fictional complainant reports a threat to publish private material unless they comply with demands. Preserve communications; do not redistribute sensitive content.",
    priorityFactors: { safetyConcern: false, timeSensitiveFraud: false, ongoingActivity: true, affectedVictims: 2, evidenceUrgency: true, pendingAction: true },
    timeline: [["2026-10-22T11:15:00+05:30", "Report received"], ["2026-10-22T13:00:00+05:30", "Platform preservation request drafted"]]
  },
  {
    id: "CM-2026-1045", complaintType: "Phishing", reportedAt: "2026-10-21T14:05:00+05:30", loss: 12600,
    indicators: ["Credential reset requested", "No further account activity reported"], evidenceStatus: "Email headers available",
    evidence: ["DEMO-PHI-1045-A · email header reference", "DEMO-PHI-1045-B · bank contact reference"],
    officer: "Investigator A", status: "Investigating", followUpDue: "2026-10-27T17:00:00+05:30",
    description: "A fictional phishing report includes a suspicious message and a reported transfer. The complainant says credentials have been reset and no further account activity is known.",
    priorityFactors: { safetyConcern: false, timeSensitiveFraud: true, ongoingActivity: false, affectedVictims: 1, evidenceUrgency: false, pendingAction: false },
    timeline: [["2026-10-21T14:05:00+05:30", "Report received"], ["2026-10-21T15:25:00+05:30", "Message headers attached by reference"]]
  },
  {
    id: "CM-2026-1046", complaintType: "Identity theft", reportedAt: "2026-10-20T10:30:00+05:30", loss: null,
    indicators: ["Account access attempt", "Recovery request submitted"], evidenceStatus: "Identity provider response pending",
    evidence: ["DEMO-IDT-1046-A · account recovery reference", "DEMO-IDT-1046-B · sign-in alert reference"],
    officer: "Investigator D", status: "Awaiting follow-up", followUpDue: "2026-10-24T16:00:00+05:30",
    description: "A fictional report describes an attempted takeover of an online account. No confirmed financial loss is reported; account recovery and access logs are pending.",
    priorityFactors: { safetyConcern: false, timeSensitiveFraud: false, ongoingActivity: true, affectedVictims: 1, evidenceUrgency: false, pendingAction: true },
    timeline: [["2026-10-20T10:30:00+05:30", "Report received"], ["2026-10-20T11:45:00+05:30", "Recovery request reference recorded"]]
  },
  {
    id: "CM-2026-1047", complaintType: "Social media impersonation", reportedAt: "2026-10-19T13:55:00+05:30", loss: 0,
    indicators: ["Impersonating profile reported", "Potential contacts targeted"], evidenceStatus: "Public profile capture available",
    evidence: ["DEMO-SMI-1047-A · profile URL reference", "DEMO-SMI-1047-B · report confirmation"],
    officer: "Investigator B", status: "Triage", followUpDue: "2026-10-28T10:00:00+05:30",
    description: "A fictional profile is reported to be impersonating a public-facing person and contacting their followers. No victim personal details are included.",
    priorityFactors: { safetyConcern: false, timeSensitiveFraud: false, ongoingActivity: true, affectedVictims: 4, evidenceUrgency: false, pendingAction: false },
    timeline: [["2026-10-19T13:55:00+05:30", "Report received"], ["2026-10-19T14:40:00+05:30", "Public profile reference captured"]]
  },
  {
    id: "CM-2026-1048", complaintType: "UPI fraud", reportedAt: "2026-10-18T09:00:00+05:30", loss: 3200,
    indicators: ["Disputed payment", "No ongoing activity reported"], evidenceStatus: "Transaction record on file",
    evidence: ["DEMO-UPI-1048-A · transaction reference", "DEMO-UPI-1048-B · complaint acknowledgement"],
    officer: "Investigator C", status: "Investigating", followUpDue: "2026-10-29T15:00:00+05:30",
    description: "A fictional complainant disputes a single UPI payment. Available notes indicate no further account activity; routine verification is pending.",
    priorityFactors: { safetyConcern: false, timeSensitiveFraud: false, ongoingActivity: false, affectedVictims: 1, evidenceUrgency: false, pendingAction: false },
    timeline: [["2026-10-18T09:00:00+05:30", "Report received"], ["2026-10-18T11:30:00+05:30", "Transaction reference verified"]]
  },
  {
    id: "CM-2026-1049", complaintType: "Phishing", reportedAt: "2026-10-17T15:45:00+05:30", loss: null,
    indicators: ["Several reports cite similar message", "Provider retention window closing"], evidenceStatus: "Urgent preservation request needed",
    evidence: ["DEMO-PHI-1049-A · message sample reference", "DEMO-PHI-1049-B · provider request reference"],
    officer: "Investigator D", status: "Awaiting evidence", followUpDue: "2026-10-25T12:00:00+05:30",
    description: "A fictional cluster of reports cites a similar phishing message. No loss is confirmed in this record; the provider's retention window may close soon.",
    priorityFactors: { safetyConcern: false, timeSensitiveFraud: false, ongoingActivity: true, affectedVictims: 12, evidenceUrgency: true, pendingAction: true },
    timeline: [["2026-10-17T15:45:00+05:30", "Report received"], ["2026-10-18T09:20:00+05:30", "Related reports linked for review"]]
  },
  {
    id: "CM-2026-1050", complaintType: "Online blackmail", reportedAt: "2026-10-16T12:10:00+05:30", loss: null,
    indicators: ["Threat not confirmed as continuing", "Follow-up information incomplete"], evidenceStatus: "Awaiting complainant update",
    evidence: ["DEMO-BLK-1050-A · initial report reference"],
    officer: "Investigator A", status: "Awaiting follow-up", followUpDue: "2026-10-27T12:00:00+05:30",
    description: "A fictional online blackmail report is awaiting clarification about whether contact has continued. Missing information is not treated as evidence of low risk.",
    priorityFactors: { safetyConcern: false, timeSensitiveFraud: false, ongoingActivity: null, affectedVictims: 1, evidenceUrgency: null, pendingAction: true },
    timeline: [["2026-10-16T12:10:00+05:30", "Report received"], ["2026-10-16T14:00:00+05:30", "Clarification requested"]]
  },
  {
    id: "CM-2026-1051", complaintType: "Identity theft", reportedAt: "2026-10-15T08:25:00+05:30", loss: 75000,
    indicators: ["Financial loss reported", "No ongoing activity confirmed"], evidenceStatus: "Bank response recorded",
    evidence: ["DEMO-IDT-1051-A · bank response reference", "DEMO-IDT-1051-B · account alert reference"],
    officer: "Investigator B", status: "Closed", followUpDue: null,
    description: "A fictional identity-theft report records a substantial loss, but current urgent activity is not indicated and the bank response is on file. Loss amount alone does not set priority.",
    priorityFactors: { safetyConcern: false, timeSensitiveFraud: false, ongoingActivity: false, affectedVictims: 1, evidenceUrgency: false, pendingAction: false },
    timeline: [["2026-10-15T08:25:00+05:30", "Report received"], ["2026-10-18T13:40:00+05:30", "Provider response recorded"], ["2026-10-22T16:00:00+05:30", "Case closed after review"]]
  }
].map(item => ({ ...item, demo: true, notes: [] }));

function loadCases() {
  try {
    const saved = JSON.parse(localStorage.getItem(PRIORITY_CASES_KEY));
    return Array.isArray(saved) && saved.length ? saved : DEMO_CASES;
  } catch (error) {
    console.error("Unable to load saved demo case records.", error);
    return DEMO_CASES;
  }
}

function PriorityBadge({ level }) {
  return <span className={`priority-badge priority-${level.toLowerCase()}`}>{level}</span>;
}

function CaseDetails({ caseRecord, onClose, onStatusChange, onAddNote, onOverride }) {
  const [note, setNote] = useState("");
  const [overrideLevel, setOverrideLevel] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const assessment = assessCasePriority(caseRecord);

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  function submitNote(event) {
    event.preventDefault();
    if (!note.trim()) return;
    onAddNote(caseRecord.id, note.trim());
    setNote("");
  }

  function submitOverride(event) {
    event.preventDefault();
    if (!overrideLevel || !overrideReason.trim()) return;
    onOverride(caseRecord.id, overrideLevel, overrideReason.trim());
    setOverrideReason("");
  }

  return (
    <div className="priority-backdrop" role="presentation" onMouseDown={event => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <aside className="priority-drawer" role="dialog" aria-modal="true" aria-labelledby="case-detail-title">
        <div className="priority-drawer-head">
          <div><small className="eyebrow">{caseRecord.registrationStatus === "Registered" ? "Registered case" : caseRecord.demo ? "Demo case" : "Case"} · {caseRecord.id}</small><h2 id="case-detail-title">{caseRecord.complaintType}</h2></div>
          <button className="iconbtn" type="button" onClick={onClose} aria-label="Close case details"><X size={18} /></button>
        </div>
        <div className="priority-detail-summary">
          <PriorityBadge level={getEffectivePriority(caseRecord)} />
          <span className="tag" data-tone={caseRecord.registrationStatus === "Registered" ? "ok" : "warn"}>
            {caseRecord.registrationStatus || (caseRecord.demo ? "Demo data" : "Unregistered")} · browser storage
          </span>
        </div>
        <div className="priority-facts">
          <div><small>Reported</small><b>{new Date(caseRecord.reportedAt).toLocaleString()}</b></div>
          <div><small>Reported loss</small><b>{caseRecord.loss == null ? "Not applicable / not reported" : `₹${Number(caseRecord.loss).toLocaleString("en-IN")}`}</b></div>
          <div><small>Assigned officer</small><b>{caseRecord.officer}</b></div>
          <label><small>Current status</small><select value={caseRecord.status} onChange={event => onStatusChange(caseRecord.id, event.target.value)}>{STATUSES.map(status => <option key={status}>{status}</option>)}</select></label>
        </div>
        <section className="priority-detail-section">
          <h3>Incident description</h3><p>{caseRecord.description}</p>
        </section>
        <section className="priority-detail-section">
          <h3><ShieldAlert size={15} /> Priority explanation</h3>
          {caseRecord.priorityOverride && <p className="priority-override-note">Suggested {assessment.level}; investigator override: {caseRecord.priorityOverride.level}. Reason: {caseRecord.priorityOverride.reason}</p>}
          <ul className="priority-reasons">{(caseRecord.priorityReason ? [caseRecord.priorityReason] : assessment.reasons).map(reason => <li key={reason}>{reason}</li>)}</ul>
          {caseRecord.reviewPriorityScore !== undefined && <p className="priority-muted">UPI review-priority score: {caseRecord.reviewPriorityScore} points · {caseRecord.reviewPriorityLevel}. This is not a probability of fraud.</p>}
          {assessment.urgentHumanReview && <div className="priority-safety"><AlertTriangle size={15} /> Immediate safety concern: urgent human review required.</div>}
          <div className="priority-next-action"><b>Suggested next action</b><p>{(caseRecord.recommendedNextSteps || [assessment.nextAction]).join(" ")}</p></div>
        </section>
        {caseRecord.upiRecord && <section className="priority-detail-section">
          <h3>UPI transaction details</h3>
          <dl className="priority-upi-details">
            <div><dt>Case title</dt><dd>{caseRecord.upiRecord.title}</dd></div>
            <div><dt>Transaction ID / UTR</dt><dd>{caseRecord.upiRecord.transactionId}</dd></div>
            <div><dt>Amount</dt><dd>₹{Number(caseRecord.upiRecord.amount).toLocaleString("en-IN")}</dd></div>
            <div><dt>Reported loss</dt><dd>{caseRecord.upiRecord.lossAmount === "" ? "Not reported" : `₹${Number(caseRecord.upiRecord.lossAmount).toLocaleString("en-IN")}`}</dd></div>
            <div><dt>Transaction date</dt><dd>{caseRecord.upiRecord.transactionDate || "Not recorded"}</dd></div>
            <div><dt>Transaction status</dt><dd>{caseRecord.upiRecord.transactionStatus}</dd></div>
            <div><dt>Sender UPI ID</dt><dd>{caseRecord.upiRecord.senderUPI || "Not provided"}</dd></div>
            <div><dt>Receiver UPI ID</dt><dd>{caseRecord.upiRecord.receiverUPI || "Not provided"}</dd></div>
            <div><dt>Bank / payment app</dt><dd>{caseRecord.upiRecord.bankApp || "Not provided"}</dd></div>
            <div><dt>Registration status</dt><dd>{caseRecord.upiRecord.registrationStatus}</dd></div>
            <div><dt>Created</dt><dd>{new Date(caseRecord.upiRecord.createdAt).toLocaleString()}</dd></div>
            <div><dt>Registered</dt><dd>{new Date(caseRecord.upiRecord.registeredAt).toLocaleString()}</dd></div>
          </dl>
          <h4>Evidence references and notes</h4>
          <p>{caseRecord.upiRecord.evidenceNotes || "No evidence references recorded."}</p>
          {caseRecord.upiRecord.investigatorNotes && <><h4>Investigator notes</h4><p>{caseRecord.upiRecord.investigatorNotes}</p></>}
          <h4>Selected next action</h4>
          <p>{caseRecord.upiRecord.nextAction}</p>
        </section>}
        {caseRecord.audioRecord && <section className="priority-detail-section">
          <h3>Audio analysis record</h3>
          <dl className="priority-upi-details">
            <div><dt>Case title</dt><dd>{caseRecord.audioRecord.caseTitle}</dd></div>
            <div><dt>Source recording</dt><dd>{caseRecord.audioRecord.sourceFileName || "Not recorded"}</dd></div>
            <div><dt>Language</dt><dd>{caseRecord.audioRecord.language || "Not detected"}</dd></div>
            <div><dt>SHA-256</dt><dd>{caseRecord.audioRecord.audioHash || "Not recorded"}</dd></div>
            <div><dt>Hash status</dt><dd>{caseRecord.audioRecord.hashStatus}</dd></div>
            <div><dt>Registration status</dt><dd>{caseRecord.audioRecord.registrationStatus}</dd></div>
            <div><dt>Automated finding</dt><dd>{caseRecord.audioRecord.automatedFinding?.label || "No model result"}</dd></div>
            <div><dt>Created</dt><dd>{new Date(caseRecord.audioRecord.createdAt).toLocaleString()}</dd></div>
          </dl>
          <h4>Case summary</h4><p>{caseRecord.audioRecord.summary || "No case summary recorded."}</p>
          <h4>Transcript</h4>
          {caseRecord.audioRecord.transcript.length
            ? <ol className="priority-audio-transcript">{caseRecord.audioRecord.transcript.map((segment, index) => <li key={`${segment.start}-${index}`}><b>{segment.start}s–{segment.end}s{segment.flagged ? " · flagged for review" : ""}</b><p>{segment.text}</p></li>)}</ol>
            : <p>No transcript recorded.</p>}
          <h4>Investigator notes</h4>
          {caseRecord.audioRecord.investigatorNotes.length
            ? <ul className="priority-evidence">{caseRecord.audioRecord.investigatorNotes.map(note => <li key={note.id}>{note.text}</li>)}</ul>
            : <p>No investigator notes recorded.</p>}
          <h4>Evidence checklist</h4>
          <ul className="priority-evidence">{caseRecord.audioRecord.evidence.map(item => <li key={item.id}>{item.name} · {item.status}</li>)}</ul>
        </section>}
        <section className="priority-detail-section">
          <h3><Clock3 size={15} /> Timeline</h3>
          <ol className="priority-timeline">{caseRecord.timeline.map(([time, event]) => <li key={`${time}-${event}`}><time>{new Date(time).toLocaleString()}</time><span>{event}</span></li>)}</ol>
        </section>
        <section className="priority-detail-section">
          <h3><FileSearch size={15} /> Evidence references</h3>
          <p className="priority-muted">{caseRecord.evidenceStatus}</p>
          <ul className="priority-evidence">{caseRecord.evidence.map(reference => <li key={reference}>{reference}</li>)}</ul>
        </section>
        <section className="priority-detail-section">
          <h3><UserRound size={15} /> Risk indicators</h3>
          <div className="priority-indicators">{caseRecord.indicators.map(indicator => <span key={indicator}>{indicator}</span>)}</div>
          <p className="priority-muted">Potentially affected victims: {caseRecord.priorityFactors.affectedVictims ?? "Not known"} · Follow-up: {caseRecord.followUpDue ? new Date(caseRecord.followUpDue).toLocaleString() : "No deadline recorded"}</p>
        </section>
        <section className="priority-detail-section">
          <h3>Investigation notes</h3>
          <ul className="priority-notes">{(caseRecord.notes || []).map(item => <li key={item.id}><p>{item.text}</p><small>{item.officer} · {new Date(item.createdAt).toLocaleString()} · demo entry</small></li>)}</ul>
          <form className="priority-action-form" onSubmit={submitNote}>
            <label htmlFor="case-note">Add investigation note</label>
            <textarea id="case-note" rows="3" value={note} onChange={event => setNote(event.target.value)} placeholder="Record an investigation note" />
            <button className="secondary small" type="submit" disabled={!note.trim()}><Check size={13} /> Save demo note</button>
          </form>
        </section>
        <section className="priority-detail-section">
          <h3>Override suggested priority</h3>
          <form className="priority-action-form" onSubmit={submitOverride}>
            <label htmlFor="priority-override">New priority</label>
            <select id="priority-override" value={overrideLevel} onChange={event => setOverrideLevel(event.target.value)}>
              <option value="">Select a priority</option>{PRIORITIES.map(priority => <option key={priority}>{priority}</option>)}
            </select>
            <label htmlFor="priority-reason">Mandatory reason</label>
            <textarea id="priority-reason" rows="3" value={overrideReason} onChange={event => setOverrideReason(event.target.value)} placeholder="Explain the evidence or context behind this override" required />
            <button className="secondary small" type="submit" disabled={!overrideLevel || !overrideReason.trim()}>Apply demo override</button>
          </form>
          {caseRecord.priorityOverride && <button type="button" className="priority-clear-override" onClick={() => onOverride(caseRecord.id, "", "")}>Clear override and restore suggested priority</button>}
        </section>
      </aside>
    </div>
  );
}

export default function CasePriorityPage() {
  const [cases, setCases] = useState(loadCases);
  const [selectedId, setSelectedId] = useState("");
  const [query, setQuery] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("All priorities");
  const [typeFilter, setTypeFilter] = useState("All complaint types");
  const [statusFilter, setStatusFilter] = useState("All statuses");
  const [officerFilter, setOfficerFilter] = useState("All officers");
  const [sortMode, setSortMode] = useState("recent");
  const [storageMessage, setStorageMessage] = useState("");
  const selectedCase = cases.find(item => item.id === selectedId);

  useEffect(() => {
    try {
      localStorage.setItem(PRIORITY_CASES_KEY, JSON.stringify(cases));
      setStorageMessage("");
    } catch (error) {
      console.error("Unable to save demo case changes in browser storage.", error);
      setStorageMessage("Changes could not be saved in this browser. Export or copy important notes before closing.");
    }
  }, [cases]);

  useEffect(() => {
    function refreshCases() {
      setCases(loadCases());
    }
    function handleStorage(event) {
      if (event.key === PRIORITY_CASES_KEY) refreshCases();
    }
    window.addEventListener(CASE_STORE_UPDATED_EVENT, refreshCases);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener(CASE_STORE_UPDATED_EVENT, refreshCases);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  const counts = useMemo(() => ({
    total: cases.length,
    critical: cases.filter(item => getEffectivePriority(item) === "Critical").length,
    high: cases.filter(item => getEffectivePriority(item) === "High").length,
    awaiting: cases.filter(item => item.status.startsWith("Awaiting")).length
  }), [cases]);

  const visibleCases = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return cases
      .filter(item => {
        const matchesQuery = !needle || [
          item.id, item.complaintType, item.officer, item.status,
          item.indicators.join(" "), item.description
        ].join(" ").toLowerCase().includes(needle);
        return matchesQuery
          && (priorityFilter === "All priorities" || getEffectivePriority(item) === priorityFilter)
          && (typeFilter === "All complaint types" || item.complaintType === typeFilter)
          && (statusFilter === "All statuses" || item.status === statusFilter)
          && (officerFilter === "All officers" || item.officer === officerFilter);
      })
      .sort((a, b) => sortMode === "priority"
        ? PRIORITY_ORDER[getEffectivePriority(a)] - PRIORITY_ORDER[getEffectivePriority(b)] || new Date(b.registeredAt || b.reportedAt) - new Date(a.registeredAt || a.reportedAt)
        : new Date(b.registeredAt || b.reportedAt) - new Date(a.registeredAt || a.reportedAt));
  }, [cases, query, priorityFilter, typeFilter, statusFilter, officerFilter, sortMode]);

  function updateCase(id, update, timelineEvent) {
    setCases(previous => previous.map(item => item.id === id ? {
      ...item,
      ...update,
      ...(timelineEvent ? { timeline: [...item.timeline, [new Date().toISOString(), timelineEvent]] } : {})
    } : item));
  }

  function addNote(id, text) {
    const note = { id: `${Date.now()}-${Math.random()}`, text, officer: "Demo investigator", createdAt: new Date().toISOString() };
    setCases(previous => previous.map(item => item.id === id ? { ...item, notes: [...(item.notes || []), note] } : item));
  }

  function overridePriority(id, level, reason) {
    if (!level) {
      updateCase(id, { priorityOverride: null }, "Priority override cleared by demo investigator");
      return;
    }
    updateCase(id, { priorityOverride: { level, reason, changedAt: new Date().toISOString() } }, `Priority overridden to ${level} by demo investigator`);
  }

  return (
    <section className="priority-page" id="case-priority">
      <div className="priority-page-heading">
        <div>
          <small className="eyebrow">Investigator workspace · prototype</small>
          <h1>Case Priority &amp; Intelligence</h1>
          <p>Explainable triage to help investigators identify urgency and coordinate next steps.</p>
        </div>
        <span className="priority-demo-label"><Info size={14} /> DEMO + REGISTERED · saved in this browser only</span>
      </div>
      {storageMessage && <div className="priority-storage-warning" role="alert">{storageMessage}</div>}

      <div className="priority-metrics">
        <article><small>Total cases</small><b>{counts.total}</b><span>Fictional demo records</span></article>
        <article data-tone="critical"><small>Critical cases</small><b>{counts.critical}</b><span>Urgent triage indicators</span></article>
        <article data-tone="high"><small>High priority cases</small><b>{counts.high}</b><span>Prompt investigator review</span></article>
        <article data-tone="awaiting"><small>Awaiting action</small><b>{counts.awaiting}</b><span>Evidence or follow-up pending</span></article>
      </div>

      <div className="panel priority-table-panel">
        <div className="panelhead priority-table-heading">
          <div><h2><ArrowDownWideNarrow size={17} /> Prioritized case queue</h2><p>Suggested priority is rule-based triage, not a finding of guilt or a substitute for investigator judgment.</p></div>
          <span className="tag">{sortMode === "recent" ? "Newest first" : "Critical → Low"}</span>
        </div>
        <div className="priority-filters">
          <label className="priority-search"><Search size={15} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search case, type, officer or indicator" aria-label="Search cases" /></label>
          <label><span><Filter size={13} /> Priority</span><select value={priorityFilter} onChange={event => setPriorityFilter(event.target.value)}><option>All priorities</option>{PRIORITIES.map(priority => <option key={priority}>{priority}</option>)}</select></label>
          <label><span>Complaint type</span><select value={typeFilter} onChange={event => setTypeFilter(event.target.value)}><option>All complaint types</option>{[...new Set(cases.map(item => item.complaintType))].sort().map(type => <option key={type}>{type}</option>)}</select></label>
          <label><span>Case status</span><select value={statusFilter} onChange={event => setStatusFilter(event.target.value)}><option>All statuses</option>{STATUSES.map(status => <option key={status}>{status}</option>)}</select></label>
          <label><span>Assigned officer</span><select value={officerFilter} onChange={event => setOfficerFilter(event.target.value)}><option>All officers</option>{[...new Set(cases.map(item => item.officer))].sort().map(officer => <option key={officer}>{officer}</option>)}</select></label>
          <label><span>Sort cases</span><select value={sortMode} onChange={event => setSortMode(event.target.value)}><option value="recent">Most recently registered</option><option value="priority">Priority level</option></select></label>
        </div>
        <div className="priority-table-wrap">
          <table className="priority-table">
            <thead><tr><th>Case ID</th><th>Complaint type</th><th>Date reported</th><th>Reported loss</th><th>Risk indicators</th><th>Evidence status</th><th>Assigned officer</th><th>Current status</th><th>Priority</th><th>Why this priority</th><th></th></tr></thead>
            <tbody>
              {visibleCases.map(item => {
                const assessment = assessCasePriority(item);
                const priority = getEffectivePriority(item);
                return <tr key={item.id}>
                  <td><b className="mono">{item.id}</b><small>{item.registrationStatus || (item.demo ? "Demo" : "Not registered")}</small></td>
                  <td>{item.complaintType}</td>
                  <td>{new Date(item.reportedAt).toLocaleDateString()}</td>
                  <td>{item.loss == null ? "—" : `₹${Number(item.loss).toLocaleString("en-IN")}`}</td>
                  <td><div className="priority-indicator-list">{item.indicators.slice(0, 2).map(indicator => <span className="priority-indicator-chip" key={indicator} title={indicator}>{indicator}</span>)}{item.indicators.length > 2 && <span className="priority-risk-count">+{item.indicators.length - 2}</span>}</div>{assessment.urgentHumanReview && <small className="priority-urgent"><AlertTriangle size={11} /> safety review</small>}</td>
                  <td>{item.evidenceStatus}</td>
                  <td>{item.officer}</td>
                  <td><span className="priority-status">{item.status}</span></td>
                  <td><PriorityBadge level={priority} /><small>{item.reviewPriorityScore !== undefined
                    ? `${item.reviewPriorityScore} points · ${item.reviewPriorityLevel}`
                    : `${assessment.score} triage points · ${priority} priority`}</small>{item.priorityOverride && <small className="priority-overridden">Overridden</small>}</td>
                  <td className="priority-explanation">{item.priorityOverride ? `Officer override: ${item.priorityOverride.reason}` : item.priorityReason || assessment.reasons[0]}</td>
                  <td><button className="priority-view" type="button" onClick={() => setSelectedId(item.id)}>View details <ChevronRight size={13} /></button></td>
                </tr>;
              })}
              {!visibleCases.length && <tr><td className="priority-empty" colSpan="11"><FileSearch size={18} /> No cases match these filters.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="priority-table-foot"><span>{visibleCases.length} of {cases.length} cases</span><span><CalendarClock size={13} /> {sortMode === "recent" ? "Sorted by newest registration" : "Sorted by priority, then most recently registered"}</span></div>
      </div>
      <p className="priority-disclaimer"><ShieldCheck size={14} /> Loss amount alone does not determine priority. Missing information is treated as uncertainty, not low risk. Safety concerns require urgent human review. No backend case service, database, or authentication is configured in this prototype.</p>
      {selectedCase && <CaseDetails caseRecord={selectedCase} onClose={() => setSelectedId("")}
        onStatusChange={(id, status) => updateCase(id, { status }, `Status changed to ${status} by demo investigator`)}
        onAddNote={addNote} onOverride={overridePriority} />}
    </section>
  );
}
