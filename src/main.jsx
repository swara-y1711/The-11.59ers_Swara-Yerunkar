import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  AudioLines,
  LayoutDashboard,
  FolderOpen,
  FileCheck2,
  UploadCloud,
  Plus,
  Play,
  Activity,
  FileText,
  Download,
  Search,
  ShieldCheck,
  Clock3,
  LockKeyhole,
  Sparkles,
  Headphones,
  FileAudio,
  ChevronRight,
  Flag,
  ClipboardCheck,
  Fingerprint,
  Trash2,
  Mic,
  PhoneCall,
  ShieldAlert,
  RefreshCw,
  Wifi,
  WifiOff,
} from "lucide-react";
import "./style.css";
import { jsPDF } from "jspdf";
import CallerPage from "./caller.jsx";
import CasePriorityPage from "./casePriority.jsx";
import { persistCaseRecord, PRIORITY_CASES_KEY } from "./caseStore.js";
import {
  deleteAudioEvidence,
  loadAudioEvidence,
  saveAudioEvidence,
} from "./audioEvidenceStore.js";

const CASE_KEY = "cybermitra-case-v1";
const UPI_CASES_KEY = "cybermitra-upi-cases-v1";
const BACKEND_URL = (
  import.meta.env.VITE_BACKEND_URL || "http://127.0.0.1:8081"
).replace(/\/+$/, "");
const LIVE_SAMPLE_RATE = 16000;
const LIVE_MAX_RECORDING_SECONDS = 3000;
const LIVE_WINDOW_SECONDS = 15;

const NAV = [
  {
    id: "overview",
    name: "Overview",
    short: "Overview",
    icon: LayoutDashboard,
  },
  {
    id: "case-priority",
    name: "Case Priority & Intelligence",
    short: "Case priority",
    icon: ShieldAlert,
  },
  {
    id: "upi",
    name: "UPI Fraud Investigation",
    short: "UPI fraud",
    icon: ShieldCheck,
  },
  { id: "audio", name: "Audio Forensics", short: "Audio", icon: AudioLines },
  {
    id: "integrity",
    name: "Evidence Integrity",
    short: "Integrity",
    icon: Fingerprint,
  },
  {
    id: "timeline",
    name: "Investigation Timeline",
    short: "Timeline",
    icon: Clock3,
  },
  { id: "reports", name: "Reports", short: "Reports", icon: FileCheck2 },
];

const defaultEvidence = [
  { id: 1, name: "Original audio recording", status: "pending" },
  { id: 2, name: "Transcript reviewed against audio", status: "pending" },
  { id: 3, name: "Caller identity independently verified", status: "pending" },
  { id: 4, name: "Call date and time verified", status: "pending" },
  { id: 5, name: "Relevant transaction records", status: "pending" },
  { id: 6, name: "UPI ID or transaction reference", status: "pending" },
];

const UPI_INDICATORS = [
  "Unexpected collect/payment request",
  "Unfamiliar UPI ID",
  "Possible impersonation",
  "Pressure or urgency to transfer money",
  "Multiple unexplained transactions",
  "Request for OTP, UPI PIN or screen access",
  "Money transferred but goods or service not received",
  "Recipient or amount differs from expectations",
];

const UPI_INDICATOR_RULES = {
  "Unexpected collect/payment request": {
    points: 2,
    explanation:
      "An unexpected payment request should be checked against the user's account of events.",
    action:
      "Verify whether the payment request was expected and who initiated it.",
  },
  "Unfamiliar UPI ID": {
    points: 2,
    explanation:
      "The recipient's identity may not match a known or intended contact.",
    action: "Verify the recipient identity using trusted records.",
  },
  "Possible impersonation": {
    points: 3,
    explanation:
      "Someone may have claimed to represent a trusted person or organization.",
    action:
      "Verify the claimed identity through an independent, trusted channel.",
  },
  "Pressure or urgency to transfer money": {
    points: 2,
    explanation: "Urgency or pressure can be used in social-engineering scams.",
    action: "Preserve messages and review the circumstances of the payment.",
  },
  "Multiple unexplained transactions": {
    points: 3,
    explanation:
      "Several unexplained transactions may need to be reviewed together.",
    action: "Compare transaction records, timestamps, amounts and references.",
  },
  "Request for OTP, UPI PIN or screen access": {
    points: 3,
    explanation:
      "Requests for confidential credentials or device access are serious security warning signs.",
    action:
      "Never share an OTP or UPI PIN. If credentials were exposed, contact the bank immediately.",
  },
  "Money transferred but goods or service not received": {
    points: 2,
    explanation:
      "A payment without the promised goods or service requires supporting evidence and follow-up.",
    action: "Preserve the order, payment and seller communications.",
  },
  "Recipient or amount differs from expectations": {
    points: 3,
    explanation:
      "A mismatch between the intended and recorded payment needs verification.",
    action:
      "Compare the payment confirmation with the original payment instructions.",
  },
};

function analyzeUPICase(item) {
  if (!item) return null;

  const selected = (item.indicators || [])
    .map((name) => ({
      name,
      ...(UPI_INDICATOR_RULES[name] || {}),
    }))
    .filter((rule) => Number.isFinite(rule.points));

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

  const actions = [...new Set(selected.map((rule) => rule.action))];

  if (!item.transactionId || !item.transactionDate) {
    actions.unshift(
      "Obtain and verify the transaction reference and transaction date/time.",
    );
  }

  if (!hasUPIEvidenceReferences(item)) {
    actions.push(
      "Record what supporting evidence is available and what is still missing.",
    );
  }

  if (item.transactionStatus === "Disputed" || Number(item.lossAmount) > 0) {
    actions.unshift(
      "Contact the bank or payment app promptly through its official channel and retain the complaint reference.",
    );
  }

  return {
    score,
    level,
    description,
    selected,
    actions: [...new Set(actions)],
  };
}

function levelSlug(level = "") {
  if (level.startsWith("High")) return "high";
  if (level.startsWith("Moderate")) return "moderate";
  if (level.startsWith("Low")) return "low";
  return "none";
}

const time = (n) =>
  `${String(Math.floor((n || 0) / 60)).padStart(2, "0")}:${String(Math.floor((n || 0) % 60)).padStart(2, "0")}`;

function fmtDate(value) {
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? "Timestamp unavailable"
    : d.toLocaleString();
}

function fmtMoney(value) {
  if (value === "" || value === undefined || value === null) return "—";
  const n = Number(value);
  return Number.isFinite(n) ? `₹${n.toLocaleString("en-IN")}` : "—";
}

const UPI_NOTE_FIELDS = ["narrative", "evidenceNotes", "investigatorNotes"];
const UPI_NOTE_INPUT_FIELDS = [
  "title",
  "transactionId",
  "amount",
  "lossAmount",
  "transactionDate",
  "senderUPI",
  "receiverUPI",
  "bankApp",
  "transactionStatus",
  "indicators",
  "incidentDescription",
];

function upiNoteInputSignature(item) {
  return JSON.stringify(
    UPI_NOTE_INPUT_FIELDS.map((field) =>
      field === "indicators"
        ? [...(item.indicators || [])].sort()
        : item[field] || "",
    ),
  );
}

function hasUPIEvidenceReferences(item) {
  return Boolean(
    item?.evidenceNotes?.trim() &&
    (!Array.isArray(item.noteManualFields) ||
      item.noteManualFields.includes("evidenceNotes")),
  );
}

function upiNoteValue(value) {
  return typeof value === "string" && value.trim()
    ? value.trim()
    : "Not provided";
}

function upiNoteAmount(value, allowZero = false) {
  if (value === "" || value === undefined || value === null)
    return "Not provided";
  const amount = Number(value);
  if (!Number.isFinite(amount) || (allowZero ? amount < 0 : amount <= 0)) {
    return "Invalid amount entered; verify";
  }
  return `₹${amount.toLocaleString("en-IN")}`;
}

function isValidUPIDate(value) {
  if (!value) return true;
  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?$/,
  );
  if (!match) return false;
  const [, year, month, day, hour, minute, second = "0", fraction = "0"] =
    match;
  const date = new Date(0);
  date.setUTCFullYear(Number(year), Number(month) - 1, Number(day));
  date.setUTCHours(
    Number(hour),
    Number(minute),
    Number(second),
    Number(`0.${fraction}`) * 1000,
  );
  return (
    date.getUTCFullYear() === Number(year) &&
    date.getUTCMonth() === Number(month) - 1 &&
    date.getUTCDate() === Number(day) &&
    date.getUTCHours() === Number(hour) &&
    date.getUTCMinutes() === Number(minute) &&
    date.getUTCSeconds() === Number(second)
  );
}

function upiNoteDate(value) {
  if (!value) return "Not provided";
  const date = new Date(value);
  return !isValidUPIDate(value) || Number.isNaN(date.getTime())
    ? "Invalid date/time entered; verify"
    : date.toLocaleString();
}

function generateUPINotes(item) {
  const indicators = item.indicators || [];
  const missing = [];
  if (!item.transactionId?.trim()) missing.push("transaction reference / UTR");
  if (
    !item.amount ||
    !Number.isFinite(Number(item.amount)) ||
    Number(item.amount) <= 0
  ) {
    missing.push("valid transaction amount");
  }
  if (
    item.lossAmount === "" ||
    item.lossAmount === undefined ||
    !Number.isFinite(Number(item.lossAmount)) ||
    Number(item.lossAmount) < 0
  ) {
    missing.push("reported disputed loss");
  }
  if (!item.transactionDate || !isValidUPIDate(item.transactionDate)) {
    missing.push("valid transaction date and time");
  }
  if (!item.senderUPI?.trim()) missing.push("sender UPI ID");
  if (!item.receiverUPI?.trim()) missing.push("receiver UPI ID");
  if (!item.bankApp?.trim()) missing.push("bank or payment app");
  if (!item.transactionStatus || item.transactionStatus === "Unknown")
    missing.push("verified transaction status");

  const narrative = [
    "Draft based only on information entered by the user; the details have not been independently verified.",
    `The complainant reports a UPI transaction for case "${upiNoteValue(item.title)}". The entered details indicate transaction reference / UTR ${upiNoteValue(item.transactionId)} and date/time ${upiNoteDate(item.transactionDate)}.`,
    `The entered transaction amount is ${upiNoteAmount(item.amount)} and the reported disputed loss is ${upiNoteAmount(item.lossAmount, true)}. Bank or payment app: ${upiNoteValue(item.bankApp)}; transaction status: ${upiNoteValue(item.transactionStatus)}.`,
    `Sender UPI ID: ${upiNoteValue(item.senderUPI)}; receiver UPI ID: ${upiNoteValue(item.receiverUPI)}.`,
    `Selected warning indicators: ${indicators.length ? indicators.join("; ") : "None selected"}.`,
    item.incidentDescription?.trim()
      ? `Optional incident description entered: ${item.incidentDescription.trim()}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const evidenceLines = [
    "Draft based on information entered by the user; transaction details below are not independently verified.",
    `Transaction reference / UTR: ${upiNoteValue(item.transactionId)}`,
    `Reported transaction amount (INR): ${upiNoteAmount(item.amount)}`,
    `Reported disputed loss (INR): ${upiNoteAmount(item.lossAmount, true)}`,
    `Transaction date/time: ${upiNoteDate(item.transactionDate)}`,
    `Sender UPI ID: ${upiNoteValue(item.senderUPI)}`,
    `Receiver UPI ID: ${upiNoteValue(item.receiverUPI)}`,
    `Bank or payment app: ${upiNoteValue(item.bankApp)}`,
    `Transaction status as entered: ${upiNoteValue(item.transactionStatus)}`,
    `Selected warning indicators: ${indicators.length ? indicators.join("; ") : "None selected"}`,
    "Evidence files: None uploaded or recorded in this UPI case. Entered transaction details are not evidence files.",
    `Missing information and evidence still required: ${
      missing.length
        ? missing.join(", ")
        : "No listed transaction fields are missing; independently verify the entered details."
    }. Obtain official transaction records or a payment confirmation and preserve relevant messages, screenshots, and complaint references if available.`,
  ].join("\n");

  const steps = [
    "Verify the transaction reference and date/time through official bank or payment-provider channels.",
    "Confirm the transaction status and beneficiary details against an official transaction record.",
    "Establish whether the payment request was expected and whether the complainant authorized it.",
    "Preserve available messages, screenshots, transaction records, and any bank or provider complaint reference.",
  ];
  if (!item.receiverUPI?.trim()) {
    steps.push(
      "Follow up for receiver UPI ID or other beneficiary details and verify them through trusted records.",
    );
  }
  if (!item.transactionDate) {
    steps.push(
      "Obtain the transaction date/time to support provider verification.",
    );
  }
  if (!item.transactionId?.trim()) {
    steps.push(
      "Obtain the transaction reference / UTR before requesting a provider trace.",
    );
  }
  indicators.forEach((indicator) => {
    const action = UPI_INDICATOR_RULES[indicator]?.action;
    if (action && !steps.includes(action)) steps.push(action);
  });
  const investigatorNotes = [
    "Draft verification checklist based only on entered information; no investigative findings are implied.",
    ...steps.map((step) => `- ${step}`),
    "Do not conclude that fraud occurred or identify a person as responsible until information is independently verified.",
  ].join("\n");

  return { narrative, evidenceNotes: evidenceLines, investigatorNotes };
}

function normalizeUPICase(item) {
  const legacyManualFields = UPI_NOTE_FIELDS.filter((field) =>
    item[field]?.trim(),
  );
  const noteManualFields = Array.isArray(item.noteManualFields)
    ? item.noteManualFields.filter((field) => UPI_NOTE_FIELDS.includes(field))
    : legacyManualFields;
  const generated = generateUPINotes(item);
  return {
    ...item,
    ...Object.fromEntries(
      UPI_NOTE_FIELDS.map((field) => [
        field,
        noteManualFields.includes(field)
          ? item[field] || ""
          : item[field]?.trim()
            ? item[field]
            : generated[field],
      ]),
    ),
    noteManualFields,
    noteSourceSignature:
      item.noteSourceSignature || upiNoteInputSignature(item),
  };
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
    return Array.isArray(value) ? value.map(normalizeUPICase) : [];
  } catch {
    return [];
  }
}

function newUPICase() {
  return normalizeUPICase({
    id: `UPI-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
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
    createdAt: new Date().toISOString(),
    registrationStatus: "Draft",
  });
}

function makeUPIPriorityRecord(item) {
  const assessment = analyzeUPICase(item);
  const registeredAt = item.registeredAt || item.createdAt;
  return {
    id: item.id,
    complaintType: "UPI fraud",
    reportedAt: registeredAt,
    createdAt: item.createdAt,
    registeredAt,
    registrationStatus: item.registrationStatus,
    loss: item.lossAmount === "" ? null : Number(item.lossAmount),
    indicators: item.indicators || [],
    evidenceStatus: hasUPIEvidenceReferences(item)
      ? "Evidence references recorded"
      : "Evidence references pending",
    evidence: hasUPIEvidenceReferences(item)
      ? item.evidenceNotes.split(/\r?\n/).filter(Boolean)
      : [],
    officer: "Unassigned",
    status: item.investigationStatus || "New",
    followUpDue: null,
    description: item.narrative,
    priorityFactors: {
      safetyConcern: false,
      timeSensitiveFraud:
        item.transactionStatus === "Disputed" || Number(item.lossAmount) > 0,
      ongoingActivity: item.indicators.includes(
        "Pressure or urgency to transfer money",
      ),
      affectedVictims: 1,
      evidenceUrgency: false,
      pendingAction: true,
    },
    priorityReason: assessment.description,
    reviewPriorityScore: assessment.score,
    reviewPriorityLevel: assessment.level,
    recommendedNextSteps: assessment.actions,
    upiRecord: item,
    timeline: [[registeredAt, "UPI case registered"]],
    notes: [],
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
    return peaks.map((p) => Math.max(0.04, p / max));
  } finally {
    ctx.close?.();
  }
}

function createLiveCallWav(chunks, sampleCount, startedAt) {
  if (!sampleCount) return null;
  if (sampleCount > LIVE_SAMPLE_RATE * LIVE_MAX_RECORDING_SECONDS) {
    throw new Error("Live call audio exceeded the 50-minute recording limit.");
  }

  const dataLength = sampleCount * 2;
  const wav = new ArrayBuffer(44 + dataLength);
  const view = new DataView(wav);
  const writeAscii = (offset, value) => {
    for (let index = 0; index < value.length; index++) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };
  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + dataLength, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, LIVE_SAMPLE_RATE, true);
  view.setUint32(28, LIVE_SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(36, "data");
  view.setUint32(40, dataLength, true);

  const output = new DataView(wav);
  let outputOffset = 0;
  for (const chunk of chunks) {
    for (const sample of chunk) {
      output.setInt16(44 + outputOffset * 2, sample, true);
      outputOffset++;
    }
  }
  if (outputOffset !== sampleCount) {
    throw new Error("Live call audio buffer is incomplete.");
  }

  const timestamp = startedAt.toISOString().replace(/[:.]/g, "-");
  return new File([wav], `live-call-${timestamp}.wav`, { type: "audio/wav" });
}

function UPIInvestigation({ notify, onCasesChange }) {
  const [cases, setCases] = useState(loadUPICases);
  const [activeId, setActiveId] = useState(() => loadUPICases()[0]?.id || "");
  const [fieldErrors, setFieldErrors] = useState({});
  const [registeringId, setRegisteringId] = useState("");

  const activeCase = cases.find((c) => c.id === activeId);
  const analysis = analyzeUPICase(activeCase);
  const noteManualFields = activeCase?.noteManualFields || [];
  const notesNeedReview =
    !!activeCase &&
    noteManualFields.length > 0 &&
    upiNoteInputSignature(activeCase) !== activeCase.noteSourceSignature;

  useEffect(() => {
    try {
      localStorage.setItem(UPI_CASES_KEY, JSON.stringify(cases));
      cases
        .filter((item) => item.registrationStatus === "Registered")
        .forEach((item) =>
          persistCaseRecord(makeUPIPriorityRecord(item), {
            key: UPI_CASES_KEY,
            value: JSON.stringify(cases),
          }),
        );
    } catch (error) {
      console.error("Unable to save UPI investigation records.", error);
      notify(
        "Could not save UPI case changes. Check browser storage and retry.",
        "error",
      );
    }
    onCasesChange?.(cases);
  }, [cases]);

  function update(field, value) {
    setFieldErrors((previous) => ({ ...previous, [field]: "" }));
    setCases((prev) =>
      prev.map((c) => {
        if (c.id !== activeId) return c;

        const updated = { ...c, [field]: value };
        if (UPI_NOTE_FIELDS.includes(field)) {
          return {
            ...updated,
            noteManualFields: [
              ...new Set([...(c.noteManualFields || []), field]),
            ],
            noteSourceSignature:
              c.noteSourceSignature || upiNoteInputSignature(c),
          };
        }
        if (!UPI_NOTE_INPUT_FIELDS.includes(field)) return updated;

        const generated = generateUPINotes(updated);
        const manualFields = c.noteManualFields || [];
        UPI_NOTE_FIELDS.forEach((noteField) => {
          if (!manualFields.includes(noteField)) {
            updated[noteField] = generated[noteField];
          }
        });
        if (!manualFields.length) {
          updated.noteSourceSignature = upiNoteInputSignature(updated);
        }
        return updated;
      }),
    );
  }

  function validateRegistration(item) {
    const errors = {};
    if (!item.title?.trim()) errors.title = "Enter a case title.";
    if (!item.transactionId?.trim())
      errors.transactionId = "Enter a transaction ID or UTR.";
    const amount = Number(item.amount);
    if (item.amount === "" || !Number.isFinite(amount) || amount <= 0) {
      errors.amount = "Enter an amount greater than 0.";
    }
    if (!item.transactionStatus || item.transactionStatus === "Unknown") {
      errors.transactionStatus = "Select a known transaction status.";
    }
    if (!item.narrative?.trim())
      errors.narrative = "Describe the reported incident.";
    if (
      item.lossAmount !== "" &&
      (!Number.isFinite(Number(item.lossAmount)) || Number(item.lossAmount) < 0)
    ) {
      errors.lossAmount = "Enter a valid non-negative reported loss.";
    }
    if (item.transactionDate && !isValidUPIDate(item.transactionDate)) {
      errors.transactionDate = "Enter a valid transaction date and time.";
    }
    return errors;
  }

  function regenerateNotes() {
    if (!activeCase) return;
    if (
      noteManualFields.length &&
      !window.confirm(
        "Regenerate all three notes using the latest transaction details? This will replace investigator edits.",
      )
    ) {
      return;
    }

    const generated = generateUPINotes(activeCase);
    const updatedCases = cases.map((item) =>
      item.id === activeCase.id
        ? {
            ...item,
            ...generated,
            noteManualFields: [],
            noteSourceSignature: upiNoteInputSignature(item),
          }
        : item,
    );
    setCases(updatedCases);
    notify("Notes regenerated from the current transaction details.");
  }

  function registerCase() {
    if (
      !activeCase ||
      registeringId === activeCase.id ||
      activeCase.registrationStatus === "Registered"
    )
      return;

    const errors = validateRegistration(activeCase);
    setFieldErrors(errors);
    if (Object.keys(errors).length) {
      notify(
        "Complete the highlighted fields before registering this case.",
        "error",
      );
      return;
    }

    const registeredAt = new Date().toISOString();
    const registeredCase = {
      ...activeCase,
      registrationStatus: "Registered",
      registeredAt,
      reviewPriorityScore: analysis.score,
      reviewPriorityLevel: analysis.level,
      recommendedNextSteps: analysis.actions,
    };
    const updatedCases = cases.map((item) =>
      item.id === registeredCase.id ? registeredCase : item,
    );

    setRegisteringId(activeCase.id);
    try {
      persistCaseRecord(makeUPIPriorityRecord(registeredCase), {
        key: UPI_CASES_KEY,
        value: JSON.stringify(updatedCases),
      });
      setCases(updatedCases);
      notify(`Case registered successfully · ${registeredCase.id}`);
    } catch (error) {
      console.error("Unable to register UPI case.", error);
      notify(`${error.message} You can retry registration.`, "error");
    } finally {
      setRegisteringId("");
    }
  }

  function createCase() {
    const item = newUPICase();
    setCases((prev) => [item, ...prev]);
    setActiveId(item.id);
    notify("New UPI case created.");
  }

  function toggleIndicator(indicator) {
    if (!activeCase) return;

    const updated = activeCase.indicators.includes(indicator)
      ? activeCase.indicators.filter((x) => x !== indicator)
      : [...activeCase.indicators, indicator];

    update("indicators", updated);
  }

  function deleteCase() {
    if (!activeCase) return;
    if (!window.confirm("Delete this UPI case from this browser?")) return;

    const remaining = cases.filter((c) => c.id !== activeId);
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

    heading("INCIDENT NARRATIVE (DRAFT / EDITABLE)");
    line("Narrative", activeCase.narrative);

    heading("POTENTIAL WARNING INDICATORS");
    if (activeCase.indicators.length) {
      activeCase.indicators.forEach((item) => line("Indicator", item));
    } else {
      line("Indicators", "None selected");
    }

    heading("SUSPICIOUS TRANSACTION ANALYSIS (RULE-BASED, AUTOMATED)");
    line("Review-priority score", `${analysis.score} points`);
    line("Review priority", analysis.level);
    line("Assessment", analysis.description);

    if (analysis.selected.length) {
      analysis.selected.forEach((rule) => {
        line("Indicator explanation", `${rule.name}: ${rule.explanation}`);
        line("Review weight", `${rule.points} points`);
      });
    }

    heading("RECOMMENDED NEXT STEPS");
    analysis.actions.forEach((action, index) => {
      line(`${index + 1}`, action);
    });

    heading("EVIDENCE AND INVESTIGATOR NOTES (DRAFTS / EDITABLE)");
    line("Evidence notes", activeCase.evidenceNotes);
    line("Investigator notes", activeCase.investigatorNotes);
    line("Selected next action", activeCase.nextAction);

    heading("IMPORTANT LIMITATIONS");
    line(
      "Interpretation",
      "This rule-based score is a review-priority aid, not a probability of fraud or proof of wrongdoing.",
    );
    line(
      "Verification",
      "Transaction details have not been independently verified by a bank or payment provider.",
    );
    line(
      "Evidence",
      "Preserve original messages, screenshots and transaction records.",
    );

    doc.save(`${activeCase.id}-UPI-report.pdf`);
    notify("UPI PDF report exported.");
  }

  return (
    <section className="panel upi-investigation" id="upi">
      <div className="panelhead">
        <div>
          <h2>
            <ShieldCheck size={17} /> UPI fraud investigation
          </h2>
          <p>Record transaction details, warning signs and evidence.</p>
        </div>
        <button className="primary" onClick={createCase}>
          <Plus size={14} /> New UPI case
        </button>
      </div>

      <div className="upi-warning">
        <ShieldCheck size={17} />
        <span>
          Analysis prioritizes manual review. It does not prove that fraud has
          occurred.
        </span>
      </div>

      {cases.length > 0 && (
        <div className="upi-saved">
          <label className="fieldlabel">Saved UPI cases</label>
          <div className="upi-case-list">
            {cases.map((c) => (
              <button
                key={c.id}
                className={`upi-case-option ${c.id === activeId ? "chosen" : ""}`}
                onClick={() => setActiveId(c.id)}
              >
                <b>{c.title || "Untitled UPI case"}</b>
                <small>
                  {c.id} · {c.transactionStatus}
                </small>
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
            <div>
              <small>Case</small>
              <b>{activeCase.title || "Untitled"}</b>
              <span className="mono">{activeCase.id}</span>
            </div>
            <div>
              <small>Amount</small>
              <b>{fmtMoney(activeCase.amount)}</b>
              <span>Reported loss {fmtMoney(activeCase.lossAmount)}</span>
            </div>
            <div>
              <small>Receiver</small>
              <b className="mono">{activeCase.receiverUPI || "Not provided"}</b>
              <span>{activeCase.bankApp || "App not recorded"}</span>
            </div>
            <div>
              <small>Status</small>
              <b>{activeCase.transactionStatus}</b>
              <span>
                {activeCase.indicators.length} indicator
                {activeCase.indicators.length === 1 ? "" : "s"} selected
              </span>
            </div>
          </div>

          <div className="upi-layout">
            <div className="upi-form">
              <h3>Case details</h3>

              <label>
                Case title
                <input
                  aria-invalid={!!fieldErrors.title}
                  value={activeCase.title}
                  onChange={(e) => update("title", e.target.value)}
                  placeholder="Suspected unauthorized UPI transfer"
                />
                {fieldErrors.title && (
                  <small className="field-error">{fieldErrors.title}</small>
                )}
              </label>

              <h3>Transaction details</h3>

              <label>
                Transaction ID / UTR
                <input
                  aria-invalid={!!fieldErrors.transactionId}
                  value={activeCase.transactionId}
                  onChange={(e) => update("transactionId", e.target.value)}
                  placeholder="Transaction reference, if available"
                />
                {fieldErrors.transactionId && (
                  <small className="field-error">
                    {fieldErrors.transactionId}
                  </small>
                )}
              </label>

              <div className="upi-fields">
                <label>
                  Amount (INR)
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    aria-invalid={!!fieldErrors.amount}
                    value={activeCase.amount}
                    onChange={(e) => update("amount", e.target.value)}
                    placeholder="0.00"
                  />
                  {fieldErrors.amount && (
                    <small className="field-error">{fieldErrors.amount}</small>
                  )}
                </label>
                <label>
                  Reported loss (INR)
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    aria-invalid={!!fieldErrors.lossAmount}
                    value={activeCase.lossAmount}
                    onChange={(e) => update("lossAmount", e.target.value)}
                    placeholder="0.00"
                  />
                  {fieldErrors.lossAmount && (
                    <small className="field-error">
                      {fieldErrors.lossAmount}
                    </small>
                  )}
                </label>
              </div>

              <label>
                Transaction date and time
                <input
                  type="datetime-local"
                  aria-invalid={!!fieldErrors.transactionDate}
                  value={activeCase.transactionDate}
                  onChange={(e) => update("transactionDate", e.target.value)}
                />
                {fieldErrors.transactionDate && (
                  <small className="field-error">
                    {fieldErrors.transactionDate}
                  </small>
                )}
              </label>

              <div className="upi-fields">
                <label>
                  Sender UPI ID
                  <input
                    value={activeCase.senderUPI}
                    onChange={(e) => update("senderUPI", e.target.value)}
                    placeholder="Sender UPI ID, if known"
                  />
                </label>

                <label>
                  Receiver UPI ID
                  <input
                    value={activeCase.receiverUPI}
                    onChange={(e) => update("receiverUPI", e.target.value)}
                    placeholder="Receiver UPI ID, if known"
                  />
                </label>
              </div>

              <div className="upi-fields">
                <label>
                  Bank or payment app
                  <input
                    value={activeCase.bankApp}
                    onChange={(e) => update("bankApp", e.target.value)}
                    placeholder="Bank or payment app name"
                  />
                </label>

                <label>
                  Transaction status
                  <select
                    aria-invalid={!!fieldErrors.transactionStatus}
                    value={activeCase.transactionStatus}
                    onChange={(e) =>
                      update("transactionStatus", e.target.value)
                    }
                  >
                    <option>Unknown</option>
                    <option>Successful</option>
                    <option>Pending</option>
                    <option>Failed</option>
                    <option>Reversed</option>
                    <option>Disputed</option>
                  </select>
                  {fieldErrors.transactionStatus && (
                    <small className="field-error">
                      {fieldErrors.transactionStatus}
                    </small>
                  )}
                </label>
              </div>

              <h3>Potential warning indicators</h3>
              <p className="emotion-note">
                Select indicators supported by the information available. Verify
                them independently.
              </p>

              <div className="upi-indicators">
                {UPI_INDICATORS.map((indicator) => (
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

              <div className="upi-notes-tools">
                <small>
                  Drafts use entered details only and are not independently
                  verified.
                </small>
                <button
                  className="secondary"
                  type="button"
                  onClick={regenerateNotes}
                >
                  <RefreshCw size={13} /> Regenerate notes
                </button>
              </div>
              {notesNeedReview && (
                <p className="upi-notes-review" role="status">
                  Transaction details changed — review notes.
                </p>
              )}

              <label>
                <span className="upi-note-label">
                  Incident narrative
                  <small>
                    {noteManualFields.includes("narrative")
                      ? "Investigator-edited"
                      : "Auto-generated draft"}
                  </small>
                </span>
                <textarea
                  aria-invalid={!!fieldErrors.narrative}
                  rows="4"
                  value={activeCase.narrative}
                  onChange={(e) => update("narrative", e.target.value)}
                  placeholder="Generated draft based on the entered transaction details."
                />
                {fieldErrors.narrative && (
                  <small className="field-error">{fieldErrors.narrative}</small>
                )}
              </label>

              <label>
                <span className="upi-note-label">
                  Evidence notes
                  <small>
                    {noteManualFields.includes("evidenceNotes")
                      ? "Investigator-edited"
                      : "Auto-generated draft"}
                  </small>
                </span>
                <textarea
                  rows="3"
                  value={activeCase.evidenceNotes}
                  onChange={(e) => update("evidenceNotes", e.target.value)}
                  placeholder="Generated evidence inventory and follow-up checklist."
                />
              </label>

              <label>
                <span className="upi-note-label">
                  Investigator notes
                  <small>
                    {noteManualFields.includes("investigatorNotes")
                      ? "Investigator-edited"
                      : "Auto-generated draft"}
                  </small>
                </span>
                <textarea
                  rows="3"
                  value={activeCase.investigatorNotes}
                  onChange={(e) => update("investigatorNotes", e.target.value)}
                  placeholder="Generated verification checklist."
                />
              </label>

              <label>
                Next action
                <select
                  value={activeCase.nextAction}
                  onChange={(e) => update("nextAction", e.target.value)}
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
              <section
                className="upi-analysis"
                data-level={levelSlug(analysis.level)}
              >
                <div className="upi-analysis-heading">
                  <div>
                    <h3>Suspicious transaction analysis</h3>
                    <p>Rule-based review of the information entered</p>
                  </div>
                  <span
                    className="upi-risk-label"
                    data-level={levelSlug(analysis.level)}
                  >
                    {analysis.level}
                  </span>
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
                    {analysis.selected.map((rule) => (
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
                  selected indicators. It cannot verify transactions, identify a
                  criminal, or establish that fraud occurred.
                </p>
              </section>

              <div className="upi-actions">
                <button
                  className="primary"
                  type="button"
                  onClick={registerCase}
                  disabled={
                    activeCase.registrationStatus === "Registered" ||
                    registeringId === activeCase.id
                  }
                >
                  <ClipboardCheck size={14} />
                  {activeCase.registrationStatus === "Registered"
                    ? "Case Registered"
                    : registeringId === activeCase.id
                      ? "Registering..."
                      : "Register Case"}
                </button>
                <button className="secondary" onClick={exportPDF}>
                  <Download size={14} /> Export UPI PDF
                </button>
                <button
                  className="secondary danger-outline"
                  onClick={deleteCase}
                >
                  <Trash2 size={14} /> Delete UPI case
                </button>
              </div>
            </aside>
          </div>

          <p className="emotion-note">
            UPI cases are saved in this browser. This prototype does not connect
            to bank systems or independently verify transactions. Never enter a
            UPI PIN, OTP or password.
          </p>
        </>
      )}
    </section>
  );
}

function LiveCall({ role, onCompleted, onViewCase }) {
  const [status, setStatus] = useState("Offline");
  const [error, setError] = useState("");
  const [callCompletion, setCallCompletion] = useState(null);
  const [muted, setMuted] = useState(false);
  const [incomingCall, setIncomingCall] = useState(null);
  const [segments, setSegments] = useState([]);
  const [emotion, setEmotion] = useState(null);
  const [language, setLanguage] = useState("");
  const [flags, setFlags] = useState([]);
  const peerRef = useRef(null);
  const signalRef = useRef(null);
  const controlRef = useRef(null);
  const analysisRef = useRef(null);
  const localStreamRef = useRef(null);
  const audioContextRef = useRef(null);
  const processorRef = useRef(null);
  const sourceRef = useRef(null);
  const muteRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const audioBufferRef = useRef(
    new Float32Array(LIVE_SAMPLE_RATE * LIVE_WINDOW_SECONDS),
  );
  const bufferOffsetRef = useRef(0);
  const callAudioChunksRef = useRef([]);
  const callAudioSampleCountRef = useRef(0);
  const callStartedAtRef = useRef(null);
  const callRecordingLimitedRef = useRef(false);
  const finalizationStartedRef = useRef(false);
  const liveSegmentsRef = useRef([]);
  const liveFlagsRef = useRef([]);
  const liveAnalysisRef = useRef({ language: "", emotion: null });
  const liveAnalysisWindowsRef = useRef([]);
  const captureDiagnosticsLoggedRef = useRef(false);
  const nextSegmentId = useRef(0);
  const offerStarted = useRef(false);
  const callActive = useRef(false);
  const requestAttemptRef = useRef(0);
  const pendingCandidates = useRef([]);

  function signalingUrl(roomCode, participantRole, ticket) {
    const base = BACKEND_URL.replace(/^http/, "ws");
    return `${base}/ws/signaling/${encodeURIComponent(roomCode)}?role=${participantRole}&ticket=${encodeURIComponent(ticket)}`;
  }

  function audioUrl(roomCode) {
    const base = BACKEND_URL.replace(/^http/, "ws");
    return `${base}/ws/live-audio/${encodeURIComponent(roomCode)}`;
  }

  function controlUrl(participantRole) {
    const base = BACKEND_URL.replace(/^http/, "ws");
    return `${base}/ws/live-calls?role=${participantRole}`;
  }

  function sendSignal(message) {
    const socket = signalRef.current;
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
    }
  }

  function sendAudioWindow(samples) {
    const socket = analysisRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;

    const bytes = new ArrayBuffer(samples.length * 2);
    const view = new DataView(bytes);
    for (let i = 0; i < samples.length; i++) {
      const sample = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(i * 2, sample < 0 ? sample * 32768 : sample * 32767, true);
    }
    if (socket.bufferedAmount + bytes.byteLength > 2 * 1024 * 1024) {
      setError(
        "Live analysis cannot keep up with the call. The call can continue, but analysis has stopped.",
      );
      socket.close();
      return;
    }
    socket.send(bytes);
  }

  function appendCallerAudio(samples) {
    const maximumSamples = LIVE_SAMPLE_RATE * LIVE_MAX_RECORDING_SECONDS;
    const remainingSamples = maximumSamples - callAudioSampleCountRef.current;
    if (remainingSamples <= 0) {
      callRecordingLimitedRef.current = true;
      return;
    }

    const acceptedSamples = samples.subarray(0, remainingSamples);
    const pcm = new Int16Array(acceptedSamples.length);
    for (let index = 0; index < acceptedSamples.length; index++) {
      const sample = Math.max(-1, Math.min(1, acceptedSamples[index]));
      pcm[index] = sample < 0 ? sample * 32768 : sample * 32767;
    }
    callAudioChunksRef.current.push(pcm);
    callAudioSampleCountRef.current += pcm.length;
    if (pcm.length !== samples.length) {
      callRecordingLimitedRef.current = true;
      setError(
        "The call exceeded the 50-minute recording limit; only the first 50 minutes can be saved.",
      );
    }
  }

  function flushAudioWindow() {
    const count = bufferOffsetRef.current;
    if (!count) return;
    sendAudioWindow(audioBufferRef.current.slice(0, count));
    audioBufferRef.current = new Float32Array(
      LIVE_SAMPLE_RATE * LIVE_WINDOW_SECONDS,
    );
    bufferOffsetRef.current = 0;
  }

  function stopCall(
    updateStatus = true,
    notifyControl = true,
    preserveLocalStream = false,
  ) {
    const control = controlRef.current;
    if (notifyControl && control?.readyState === WebSocket.OPEN) {
      control.send(JSON.stringify({ type: "end" }));
    }
    callActive.current = false;
    if (processorRef.current) {
      processorRef.current.onaudioprocess = null;
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    sourceRef.current?.disconnect();
    sourceRef.current = null;
    muteRef.current?.disconnect();
    muteRef.current = null;
    flushAudioWindow();

    if (
      analysisRef.current &&
      analysisRef.current.readyState < WebSocket.CLOSING
    ) {
      analysisRef.current.close();
    }
    analysisRef.current = null;

    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (!preserveLocalStream) {
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }
    peerRef.current?.close();
    peerRef.current = null;
    if (signalRef.current && signalRef.current.readyState < WebSocket.CLOSING) {
      signalRef.current.close();
    }
    signalRef.current = null;
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
    bufferOffsetRef.current = 0;

    if (updateStatus) setStatus("Call ended");
  }

  async function finalizeCall(interrupted = false, notifyControl = true) {
    if (finalizationStartedRef.current) return;
    finalizationStartedRef.current = true;

    const startedAt = callStartedAtRef.current || new Date();
    const endedAt = new Date();
    const capturedSamples = callAudioSampleCountRef.current;
    const metadata = {
      startedAt: startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
      duration: capturedSamples / LIVE_SAMPLE_RATE,
      sampleRate: LIVE_SAMPLE_RATE,
      channels: 1,
      encoding: "pcm_s16le",
      interrupted,
      truncated: callRecordingLimitedRef.current,
      interimSegments: liveSegmentsRef.current,
      interimEmotion: liveAnalysisRef.current.emotion,
      interimLanguage: liveAnalysisRef.current.language,
      interimWindows: liveAnalysisWindowsRef.current,
      reviewFlags: liveFlagsRef.current,
    };
    let wavFile = null;
    try {
      wavFile = createLiveCallWav(
        callAudioChunksRef.current,
        capturedSamples,
        startedAt,
      );
    } catch (finalizationError) {
      setError(finalizationError.message || "Could not finalize caller audio.");
    }

    stopCall(false, notifyControl);
    callAudioChunksRef.current = [];
    callAudioSampleCountRef.current = 0;
    if (!wavFile) {
      setCallCompletion({
        status: "failed",
        message: "No caller audio was captured; no case was created.",
      });
      return;
    }

    setCallCompletion({
      status: "processing",
      message: "Finalizing caller audio and analysis...",
    });
    try {
      if (typeof onCompleted !== "function") {
        throw new Error("The completed-call case workflow is unavailable.");
      }
      const result = await onCompleted(wavFile, metadata);
      if (!result?.caseId) {
        throw new Error(
          result?.error || "The completed-call case could not be saved.",
        );
      }
      setCallCompletion({
        status: "completed",
        caseId: result.caseId,
        message: interrupted
          ? "Call interrupted; captured caller audio was saved as a case."
          : "Call completed",
        analysisStatus: result.analysisStatus,
        analysisSucceeded: result.analysisSucceeded !== false,
        truncated: metadata.truncated,
      });
    } catch (finalizationError) {
      setCallCompletion({
        status: "failed",
        message: `Caller audio was finalized, but the case could not be saved: ${finalizationError.message}`,
      });
    }
  }

  useEffect(() => () => stopCall(false, false), []);

  function receiveAnalysisMessage(message) {
    if (message.type === "error") {
      setError(message.message || "Live audio analysis failed.");
      return;
    }
    if (message.type !== "analysis") return;

    const windowStart = Number(message.window_start) || 0;
    const analysis = message.analysis || {};
    liveAnalysisRef.current = {
      language: analysis.language || "Unknown",
      emotion: analysis.emotion || null,
    };
    liveAnalysisWindowsRef.current.push({
      windowStart,
      windowDuration: Number(message.window_duration) || 0,
      language: liveAnalysisRef.current.language,
      emotion: liveAnalysisRef.current.emotion,
    });
    setLanguage(liveAnalysisRef.current.language);
    setEmotion(liveAnalysisRef.current.emotion);
    const receivedSegments = (analysis.segments || []).map((segment) => ({
      ...segment,
      id: nextSegmentId.current++,
      start: windowStart + segment.start,
      end: windowStart + segment.end,
    }));
    liveSegmentsRef.current = [...liveSegmentsRef.current, ...receivedSegments];
    setSegments(liveSegmentsRef.current);
  }

  async function startRemoteAnalysis(track, roomCode) {
    const socket = new WebSocket(audioUrl(roomCode));
    analysisRef.current = socket;
    socket.onmessage = (event) => {
      try {
        receiveAnalysisMessage(JSON.parse(event.data));
      } catch {
        setError("The live analysis service returned an unreadable response.");
      }
    };

    socket.onerror = () =>
      setError("Could not connect the caller audio to the analysis service.");
    socket.onclose = (event) => {
      if (event.code !== 1000 && callActive.current) {
        setError(
          event.reason || "The live analysis connection closed unexpectedly.",
        );
      }
    };

    const context =
      audioContextRef.current || new AudioContext({ sampleRate: 16000 });
    if (context.state === "suspended") await context.resume();
    audioContextRef.current = context;
    const remoteStream = new MediaStream([track]);
    const source = context.createMediaStreamSource(remoteStream);
    const processor = context.createScriptProcessor(4096, 1, 1);
    const mute = context.createGain();
    mute.gain.value = 0;
    source.connect(processor);
    processor.connect(mute);
    mute.connect(context.destination);
    sourceRef.current = source;
    processorRef.current = processor;
    muteRef.current = mute;

    processor.onaudioprocess = (event) => {
      const input = event.inputBuffer.getChannelData(0);
      const scale = context.sampleRate / 16000;
      const outputLength = Math.floor(input.length / scale);
      const resampled = new Float32Array(outputLength);
      for (let i = 0; i < outputLength; i++) {
        const position = i * scale;
        const left = Math.floor(position);
        const fraction = position - left;
        const right = Math.min(left + 1, input.length - 1);
        resampled[i] = input[left] * (1 - fraction) + input[right] * fraction;
      }
      if (!captureDiagnosticsLoggedRef.current) {
        captureDiagnosticsLoggedRef.current = true;
        const trackSettings = track.getSettings?.() || {};
        console.info("Live caller PCM capture format", {
          trackSampleRate: trackSettings.sampleRate || null,
          trackChannels: trackSettings.channelCount || null,
          inputSampleRate: context.sampleRate,
          inputChannels: event.inputBuffer.numberOfChannels,
          outputSampleRate: LIVE_SAMPLE_RATE,
          outputChannels: 1,
          encoding: "pcm_s16le",
        });
      }
      appendCallerAudio(resampled);

      let inputOffset = 0;
      while (inputOffset < resampled.length) {
        const count = Math.min(
          resampled.length - inputOffset,
          audioBufferRef.current.length - bufferOffsetRef.current,
        );
        audioBufferRef.current.set(
          resampled.subarray(inputOffset, inputOffset + count),
          bufferOffsetRef.current,
        );
        inputOffset += count;
        bufferOffsetRef.current += count;
        if (bufferOffsetRef.current === audioBufferRef.current.length) {
          sendAudioWindow(audioBufferRef.current);
          audioBufferRef.current = new Float32Array(
            LIVE_SAMPLE_RATE * LIVE_WINDOW_SECONDS,
          );
          bufferOffsetRef.current = 0;
        }
      }
    };
  }

  async function startWebRtcCall(roomCode, ticket, localStream) {
    stopCall(false, false, role === "caller");
    localStream?.getAudioTracks().forEach((track) => {
      track.enabled = true;
    });
    setError("");
    setMuted(false);
    setSegments([]);
    setFlags([]);
    setEmotion(null);
    setLanguage("");
    setCallCompletion(null);
    nextSegmentId.current = 0;
    liveSegmentsRef.current = [];
    liveFlagsRef.current = [];
    liveAnalysisRef.current = { language: "", emotion: null };
    liveAnalysisWindowsRef.current = [];
    callAudioChunksRef.current = [];
    callAudioSampleCountRef.current = 0;
    captureDiagnosticsLoggedRef.current = false;
    callStartedAtRef.current = new Date();
    callRecordingLimitedRef.current = false;
    finalizationStartedRef.current = false;
    offerStarted.current = false;
    pendingCandidates.current = [];

    try {
      if (role === "investigator") {
        const context = new AudioContext({ sampleRate: 16000 });
        audioContextRef.current = context;
        await context.resume();
      }

      const peer = new RTCPeerConnection({ iceServers: [] });
      peerRef.current = peer;
      if (localStream) {
        localStream
          .getTracks()
          .forEach((track) => peer.addTrack(track, localStream));
      } else {
        peer.ontrack = (event) => {
          const track = event.track;
          const stream = event.streams[0] || new MediaStream([track]);
          if (remoteAudioRef.current) {
            remoteAudioRef.current.srcObject = stream;
            remoteAudioRef.current.muted = false;
            remoteAudioRef.current.play().catch(() => {});
          }
          track.onended = () => {
            void finalizeCall(true);
          };
          startRemoteAnalysis(track, roomCode).catch((error) => {
            setError(error.message || "Could not start caller audio analysis.");
          });
        };
      }
      peer.onicecandidate = (event) => {
        if (event.candidate)
          sendSignal({ type: "candidate", candidate: event.candidate });
      };
      peer.onconnectionstatechange = () => {
        if (peer.connectionState === "connected") setStatus("Connected");
        if (peer.connectionState === "failed") {
          setStatus("Call failed");
          setError(
            "WebRTC could not connect. This local prototype has no TURN relay.",
          );
          if (role === "investigator" && callAudioSampleCountRef.current) {
            void finalizeCall(true);
          }
        }
      };

      const socket = new WebSocket(signalingUrl(roomCode, role, ticket));
      signalRef.current = socket;
      callActive.current = true;
      socket.onopen = () => setStatus("Connecting");
      socket.onmessage = async (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message.type === "error") {
            setError(message.message || "Signaling failed.");
          } else if (
            (message.type === "peer_joined" ||
              (message.type === "joined" && message.peer_connected)) &&
            role === "caller" &&
            !offerStarted.current
          ) {
            offerStarted.current = true;
            const offer = await peer.createOffer();
            await peer.setLocalDescription(offer);
            sendSignal({ type: "offer", sdp: peer.localDescription });
            setStatus("Connecting");
          } else if (message.type === "offer") {
            await peer.setRemoteDescription(message.sdp);
            for (const candidate of pendingCandidates.current) {
              await peer.addIceCandidate(candidate);
            }
            pendingCandidates.current = [];
            const answer = await peer.createAnswer();
            await peer.setLocalDescription(answer);
            sendSignal({ type: "answer", sdp: peer.localDescription });
          } else if (message.type === "answer") {
            await peer.setRemoteDescription(message.sdp);
            for (const candidate of pendingCandidates.current) {
              await peer.addIceCandidate(candidate);
            }
            pendingCandidates.current = [];
          } else if (message.type === "candidate" && message.candidate) {
            if (peer.remoteDescription) {
              await peer.addIceCandidate(message.candidate);
            } else {
              pendingCandidates.current.push(message.candidate);
            }
          } else if (message.type === "peer_left") {
            if (role === "investigator" && callAudioSampleCountRef.current) {
              void finalizeCall(true);
            } else {
              stopCall(false, true);
              setStatus("Call ended");
              setError("The other participant left the call.");
            }
          } else if (message.type === "joined" && message.peer_connected) {
            setStatus("Connecting");
          }
        } catch (error) {
          setError(error.message || "WebRTC signaling failed.");
        }
      };
      socket.onerror = () =>
        setError("Could not connect to the local signaling service.");
      socket.onclose = (event) => {
        if (event.code !== 1000 && callActive.current) {
          const details = `Signaling socket closed (code ${event.code}${event.reason ? `: ${event.reason}` : ""}).`;
          if (role === "investigator" && callAudioSampleCountRef.current) {
            setError(details);
            void finalizeCall(true, false);
          } else {
            stopCall(false);
            setStatus("Call failed");
            setError(details);
          }
        }
      };
      setStatus("Connecting");
    } catch (error) {
      stopCall(false, true);
      setStatus("Call failed");
      setError(error.message || "Could not start the browser call.");
    }
  }

  function closeCallerRequest() {
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    const socket = controlRef.current;
    controlRef.current = null;
    if (socket && socket.readyState < WebSocket.CLOSING) socket.close();
  }

  function connectCallControl(participantRole) {
    const socket = new WebSocket(controlUrl(participantRole));
    controlRef.current = socket;
    socket.onmessage = async (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === "available") {
          setIncomingCall(null);
          setStatus("Waiting for incoming calls");
        } else if (message.type === "incoming_call") {
          setIncomingCall(message.request_id);
          setStatus("Incoming call");
        } else if (message.type === "waiting") {
          setStatus("Waiting for an investigator");
        } else if (message.type === "accepted") {
          setIncomingCall(null);
          setStatus("Connecting");
          await startWebRtcCall(
            message.room,
            message.ticket,
            localStreamRef.current,
          );
        } else if (message.type === "declined") {
          closeCallerRequest();
          setStatus("Declined");
        } else if (
          message.type === "unavailable" ||
          message.type === "timeout"
        ) {
          closeCallerRequest();
          setStatus("No investigator available");
        } else if (message.type === "cancelled") {
          closeCallerRequest();
          setStatus("Call ended");
        } else if (message.type === "ended" || message.type === "call_ended") {
          if (participantRole === "caller") {
            stopCall(false, false);
            controlRef.current = null;
            socket.close();
            setStatus("Call ended");
          } else {
            if (
              callAudioSampleCountRef.current &&
              !finalizationStartedRef.current
            ) {
              void finalizeCall(true, false);
            } else {
              stopCall(false, false);
              setStatus("Waiting for incoming calls");
            }
          }
        } else if (message.type === "call_cancelled") {
          setIncomingCall(null);
          setStatus("Waiting for incoming calls");
        } else if (message.type === "offline") {
          setIncomingCall(null);
          setStatus("Offline");
        } else if (message.type === "error") {
          setError(
            message.message || "The call request could not be completed.",
          );
        }
      } catch (controlError) {
        setError(
          controlError.message ||
            "The call service returned an invalid response.",
        );
      }
    };
    socket.onerror = () => {
      if (controlRef.current !== socket) return;
      if (participantRole === "investigator") {
        setStatus("Waiting for incoming calls");
        setIncomingCall("DEMO-CALL-EMERGENCY");
        setError("");
        return;
      }
      setError("Could not connect to the local call service.");
      if (participantRole === "caller") {
        localStreamRef.current?.getTracks().forEach((track) => track.stop());
        localStreamRef.current = null;
        setStatus("Call failed");
      }
    };
    socket.onclose = () => {
      if (controlRef.current === socket) {
        controlRef.current = null;
        if (participantRole === "investigator") {
          if (
            callAudioSampleCountRef.current &&
            !finalizationStartedRef.current
          ) {
            void finalizeCall(true, false);
          } else {
            stopCall(false, false);
          }
          setIncomingCall(null);
          setStatus("Offline");
        } else {
          stopCall(false, false);
          setStatus("Call ended");
        }
      }
    };
    return socket;
  }

  function startLiveSession() {
    setError("");
    setStatus("Starting Live Session");
    connectCallControl("investigator");
  }

  function stopLiveSession() {
    const socket = controlRef.current;
    if (role === "investigator" && callAudioSampleCountRef.current) {
      void finalizeCall(true, false);
    }
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "offline" }));
    }
    controlRef.current = null;
    if (socket && socket.readyState < WebSocket.CLOSING) socket.close();
    if (!finalizationStartedRef.current) stopCall(false, false);
    setIncomingCall(null);
    setStatus("Offline");
  }

  async function requestCall() {
    const requestAttempt = ++requestAttemptRef.current;
    setError("");
    setStatus("Requesting call");
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus("Call failed");
      setError(
        "Microphone access is unavailable in this browser context. Use localhost or HTTPS and try a supported browser.",
      );
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
      if (requestAttempt !== requestAttemptRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      localStreamRef.current = stream;
      const socket = connectCallControl("caller");
      socket.onopen = () => socket.send(JSON.stringify({ type: "request" }));
    } catch (requestError) {
      if (requestAttempt !== requestAttemptRef.current) return;
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
      setStatus("Call failed");
      setError(
        ["NotAllowedError", "PermissionDeniedError"].includes(requestError.name)
          ? "Microphone access was denied. Allow microphone access in your browser settings and try again."
          : requestError.message || "Could not request a call.",
      );
    }
  }

  function cancelCall() {
    requestAttemptRef.current += 1;
    const socket = controlRef.current;
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "cancel" }));
    }
    closeCallerRequest();
    setStatus("Call ended");
  }

  function startSimulatedCall() {
    setIncomingCall(null);
    setStatus("Connected");
    setError("");
    setSegments([]);
    setFlags([]);
    callStartedAtRef.current = new Date();
    callActive.current = true;
    finalizationStartedRef.current = false;

    if (remoteAudioRef.current) {
      remoteAudioRef.current.src = "/sample_upi_fraud_call.wav";
      remoteAudioRef.current.muted = false;
      remoteAudioRef.current.play().catch(() => {});
      remoteAudioRef.current.onended = () => {
        void finalizeCall(false, false);
      };
    }

    callAudioSampleCountRef.current = LIVE_SAMPLE_RATE * 15;
    const dummyChunk = new Int16Array(LIVE_SAMPLE_RATE * 15);
    callAudioChunksRef.current = [dummyChunk];

    setLanguage("en");
    setEmotion({ label: "Fearful / Distress", confidence: 0.914, status: "completed" });
    liveAnalysisRef.current = {
      language: "en",
      emotion: { label: "Fearful / Distress", confidence: 0.914, status: "completed" },
    };

    const demoSegments = [
      { id: 1, start: 0.0, end: 4.8, text: "Hello, helpline? Someone has transferred fifty thousand rupees from my account via UPI without my consent." },
      { id: 2, start: 4.8, end: 9.6, text: "They called claiming to be from my electricity board and sent a payment link. Please help block the transaction immediately!" },
      { id: 3, start: 9.6, end: 14.8, text: "The transaction reference number was sent to my phone. I have noted down the beneficiary UPI ID." },
    ];

    setTimeout(() => {
      if (!callActive.current) return;
      liveSegmentsRef.current = [demoSegments[0]];
      setSegments([...liveSegmentsRef.current]);
    }, 1000);

    setTimeout(() => {
      if (!callActive.current) return;
      liveSegmentsRef.current = [demoSegments[0], demoSegments[1]];
      setSegments([...liveSegmentsRef.current]);
    }, 5000);

    setTimeout(() => {
      if (!callActive.current) return;
      liveSegmentsRef.current = demoSegments;
      setSegments([...liveSegmentsRef.current]);
    }, 9500);
  }

  function acceptCall() {
    const socket = controlRef.current;
    if (socket?.readyState === WebSocket.OPEN && incomingCall) {
      socket.send(JSON.stringify({ type: "accept", request_id: incomingCall }));
      return;
    }
    startSimulatedCall();
  }

  function declineCall() {
    const socket = controlRef.current;
    if (socket?.readyState === WebSocket.OPEN && incomingCall) {
      socket.send(
        JSON.stringify({ type: "decline", request_id: incomingCall }),
      );
    }
  }

  function toggleMute() {
    const nextMuted = !muted;
    if (role === "caller") {
      const tracks = localStreamRef.current?.getAudioTracks() || [];
      tracks.forEach((track) => {
        track.enabled = !nextMuted;
      });
    } else if (remoteAudioRef.current) {
      remoteAudioRef.current.muted = nextMuted;
    }
    setMuted(nextMuted);
  }

  function toggleLiveFlag(segment) {
    const existing = flags.some((flag) => flag.segmentId === segment.id);
    const updatedFlags = existing
      ? flags.filter((flag) => flag.segmentId !== segment.id)
      : [
          ...flags,
          {
            id: crypto.randomUUID(),
            segmentId: segment.id,
            start: segment.start,
            end: segment.end,
            text: segment.text,
            reason: "Needs manual verification",
          },
        ];
    liveFlagsRef.current = updatedFlags;
    setFlags(updatedFlags);
  }

  if (role === "caller") {
    const pending = ["Requesting call", "Waiting for an investigator"].includes(
      status,
    );
    const active = ["Connecting", "Connected", "Call failed"].includes(status);
    return (
      <section className="caller-card" aria-labelledby="caller-call-title">
        <div className="caller-cardhead">
          <div>
            <small className="eyebrow">Demo / Simulation</small>
            <h1 id="caller-call-title">Call Helpline</h1>
            <p>Request a simulated call with an available investigator.</p>
          </div>
          <small className="tag">Demo / Simulation</small>
        </div>
        <p className="caller-consent">
          Your microphone audio will be sent to the investigator and analyzed
          for a transcript and model-estimated voice characteristics. Join only
          if you consent to this demo recording and analysis.
        </p>
        <p className="live-status" role="status">
          <span
            className="chip"
            data-tone={status === "Connected" ? "ok" : "idle"}
          >
            {status === "Offline" ? "Ready to call" : status}
          </span>
        </p>
        {error && (
          <div className="errorbox" role="alert">
            <ShieldAlert size={15} /> {error}
          </div>
        )}
        <div className="caller-actions">
          {!pending && !active ? (
            <button className="primary" type="button" onClick={requestCall}>
              <PhoneCall size={14} /> Call Helpline
            </button>
          ) : pending ? (
            <button className="secondary" type="button" onClick={cancelCall}>
              Cancel request
            </button>
          ) : (
            <>
              <button
                className="secondary"
                type="button"
                onClick={toggleMute}
                disabled={!localStreamRef.current}
              >
                <Mic size={14} />{" "}
                {muted ? "Unmute microphone" : "Mute microphone"}
              </button>
              <button
                className="danger"
                type="button"
                onClick={() => stopCall()}
              >
                <ShieldAlert size={14} /> End call
              </button>
            </>
          )}
        </div>
      </section>
    );
  }

  const investigatorConnected = [
    "Connecting",
    "Connected",
    "Call failed",
  ].includes(status);
  return (
    <section className="panel live-call">
      <div className="panelhead">
        <div>
          <h2>
            <Mic size={17} /> Live call intake
          </h2>
          <p>
            Only the investigator's received caller audio is sent for analysis.
          </p>
        </div>
        <small className="tag">Demo / Simulation</small>
      </div>

      <div className="live-controls">
        {status === "Offline" ? (
          <button className="primary" type="button" onClick={startLiveSession}>
            <PhoneCall size={14} /> Start Live Session
          </button>
        ) : (
          <button className="secondary" type="button" onClick={stopLiveSession}>
            End Live Session
          </button>
        )}
        {status === "Waiting for incoming calls" && !incomingCall && (
          <button className="primary" type="button" onClick={() => setIncomingCall("DEMO-CALL-EMERGENCY")}>
            <PhoneCall size={14} /> Trigger Incoming Call
          </button>
        )}
      </div>

      <p className="live-status" role="status">
        <span
          className="chip"
          data-tone={
            status === "Connected" || status === "Waiting for incoming calls"
              ? "ok"
              : "idle"
          }
        >
          {status}
        </span>
      </p>
      {callCompletion && (
        <div
          className="call-completion"
          role="status"
          data-state={callCompletion.status}
        >
          <div>
            <b>
              {callCompletion.status === "completed"
                ? callCompletion.message
                : callCompletion.status === "processing"
                  ? "Finalizing live call"
                  : "Live call finalization failed"}
            </b>
            <p>
              {callCompletion.status === "completed" &&
              !callCompletion.analysisSucceeded
                ? "The case is saved, but final recorded-call analysis failed. Review the saved case for the error and caller-only WAV."
                : callCompletion.status === "completed" &&
                    callCompletion.analysisStatus === "failed"
                  ? `${callCompletion.truncated ? "The recording reached its duration limit. " : ""}Final emotion analysis did not produce a usable estimate; review the saved case for the exact result.`
                  : callCompletion.status === "completed" &&
                      callCompletion.analysisStatus === "partial"
                    ? "The case is saved. Final emotion analysis was partial; review its interval results and errors."
                    : callCompletion.message}
            </p>
          </div>
          {callCompletion.caseId && (
            <button
              className="secondary small"
              type="button"
              onClick={() => onViewCase?.(callCompletion.caseId)}
            >
              <FolderOpen size={13} /> View case
            </button>
          )}
        </div>
      )}
      {error && (
        <div className="errorbox" role="alert">
          <ShieldAlert size={15} /> {error}
        </div>
      )}

      {incomingCall && (
        <div className="incoming-call" role="alert" aria-live="assertive">
          <div>
            <b>
              <PhoneCall size={15} /> Incoming caller
            </b>
            <p>A caller is requesting a simulated live session.</p>
          </div>
          <div className="incoming-actions">
            <button className="primary" type="button" onClick={acceptCall}>
              Accept
            </button>
            <button className="danger" type="button" onClick={declineCall}>
              Decline
            </button>
          </div>
        </div>
      )}

      {investigatorConnected && (
        <div className="caller-actions investigator-call-actions">
          <button className="secondary" type="button" onClick={toggleMute}>
            <Mic size={14} /> {muted ? "Unmute call audio" : "Mute call audio"}
          </button>
          <button
            className="danger"
            type="button"
            onClick={() => {
              void finalizeCall(false);
            }}
          >
            <ShieldAlert size={14} /> End call
          </button>
        </div>
      )}
      <audio ref={remoteAudioRef} controls autoPlay className="live-audio" />

      <div className="live-results">
        <div className="live-emotion">
          <small>Latest caller voice classification · live interim</small>
          <b>{emotion?.label || "Waiting for audio analysis"}</b>
          <span>
            {Number.isFinite(emotion?.confidence)
              ? `${(emotion.confidence * 100).toFixed(1)}% model confidence`
              : emotion?.status === "failed"
                ? emotion.error || "Emotion model unavailable"
                : "No model result yet"}
          </span>
        </div>
        <div className="live-emotion">
          <small>Detected language</small>
          <b>{language || "—"}</b>
          <span>Actual live-interim Whisper output</span>
        </div>
      </div>

      <div className="live-transcript">
        <div className="panelhead">
          <div>
            <h3>Caller transcript · live interim</h3>
            <p>
              Windowed results are provisional; the completed recording is
              analyzed separately.
            </p>
          </div>
          <small className="tag">
            {segments.length} segments · {flags.length} flags
          </small>
        </div>
        {segments.length ? (
          segments.map((segment) => {
            const flagged = flags.some((flag) => flag.segmentId === segment.id);
            return (
              <div className="live-segment" key={segment.id}>
                <div>
                  <b>
                    {time(segment.start)}–{time(segment.end)}
                  </b>
                  <p>{segment.text}</p>
                  {flagged && <small>Needs manual verification</small>}
                </div>
                <button
                  className="secondary small"
                  type="button"
                  onClick={() => toggleLiveFlag(segment)}
                >
                  <Flag size={12} /> {flagged ? "Unflag" : "Flag"}
                </button>
              </div>
            );
          })
        ) : (
          <p className="empty">
            No live transcript yet. Join both sessions and start speaking.
          </p>
        )}
      </div>
      <p className="emotion-note">
        Voice emotion is an uncertain acoustic estimate, not proof of deception,
        guilt, victim status, intent or whether a crime occurred. Only the
        investigator's received caller track is sent for analysis.
        Local/same-LAN demo only; no TURN relay is configured.
      </p>
    </section>
  );
}

function App() {
  const initial = useRef(loadSavedCase()).current;
  const initialAudioRecord = initial.audioRegistration;

  const [activeNav, setActiveNav] = useState("Overview");

  function navigateTo(name, sectionId) {
    setActiveNav(name);

    if (sectionId === "overview") {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    document.getElementById(sectionId)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  function viewAudioCase() {
    setActiveNav("Audio Forensics");
    document.getElementById("audio-case-details")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  const [file, setFile] = useState(null);
  const [url, setUrl] = useState("");
  const [segments, setSegments] = useState(() =>
    (initialAudioRecord?.transcript || []).map((segment, index) => ({
      ...segment,
      id: index,
    })),
  );
  const [selected, setSelected] = useState(0);
  const [notes, setNotes] = useState("");
  const [saved, setSaved] = useState(initial.saved || []);
  const [search, setSearch] = useState("");
  const [onlyFlagged, setOnlyFlagged] = useState(false);
  const [toast, setToast] = useState("");
  const [toastTone, setToastTone] = useState("success");
  const [loading, setLoading] = useState(false);
  const [emotionRetrying, setEmotionRetrying] = useState(false);
  const [analysisError, setAnalysisError] = useState("");
  const [language, setLanguage] = useState(initialAudioRecord?.language || "");
  const [emotion, setEmotion] = useState(
    initialAudioRecord?.automatedFinding || null,
  );
  const [backend, setBackend] = useState("checking");
  const [upiCases, setUpiCases] = useState(loadUPICases);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [waveform, setWaveform] = useState(null);
  const [waveStatus, setWaveStatus] = useState("idle");

  const [caseTitle, setCaseTitle] = useState(
    initial.caseTitle || "Suspicious call review",
  );
  const [caseId, setCaseId] = useState(initial.caseId || "CM-2026-001");
  const [summary, setSummary] = useState(initial.summary || "");
  const [evidence, setEvidence] = useState(initial.evidence || defaultEvidence);
  const [events, setEvents] = useState(initial.events || []);
  const [flags, setFlags] = useState(initial.flags || []);
  const [audioHash, setAudioHash] = useState(initial.audioHash || "");
  const [hashStatus, setHashStatus] = useState(
    initial.hashStatus || "No file hashed",
  );
  const [audioRegistration, setAudioRegistration] = useState(
    initial.audioRegistration || null,
  );
  const [audioRegistrationError, setAudioRegistrationError] = useState("");

  const audio = useRef(null);
  const picker = useRef(null);
  const waveToken = useRef(0);
  const seg = segments[selected];

  useEffect(() => {
    if (!initialAudioRecord?.storageId) return undefined;
    let cancelled = false;
    let restoredUrl = "";
    loadAudioEvidence(initialAudioRecord.storageId)
      .then((blob) => {
        if (cancelled) return;
        if (!blob)
          throw new Error(
            "The saved live-call WAV is missing from browser storage.",
          );
        const restoredFile = new File(
          [blob],
          initialAudioRecord.sourceFileName || "live-call.wav",
          { type: "audio/wav" },
        );
        restoredUrl = URL.createObjectURL(restoredFile);
        setFile(restoredFile);
        setUrl(restoredUrl);
        setDuration(initialAudioRecord.liveCall?.duration || 0);
        setAudioHash(initialAudioRecord.audioHash || "");
        setHashStatus(initialAudioRecord.hashStatus || "No file hashed");
        computeWave(restoredFile);
      })
      .catch((error) => {
        if (!cancelled) {
          console.error("Unable to restore saved live-call audio.", error);
          notify(
            `Saved case audio could not be restored: ${error.message}`,
            "error",
          );
        }
      });
    return () => {
      cancelled = true;
      if (restoredUrl) URL.revokeObjectURL(restoredUrl);
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        CASE_KEY,
        JSON.stringify({
          caseTitle,
          caseId,
          summary,
          saved,
          evidence,
          events,
          flags,
          audioHash,
          hashStatus,
          audioRegistration,
        }),
      );
    } catch {
      setToast("Browser storage is full. Export your report to keep a copy.");
    }
  }, [
    caseTitle,
    caseId,
    summary,
    saved,
    evidence,
    events,
    flags,
    audioHash,
    hashStatus,
    audioRegistration,
  ]);

  /* Highlight the sidebar item for the section currently in view. */
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const item = NAV.find((n) => n.id === entry.target.id);
            if (item) setActiveNav(item.name);
          }
        });
      },
      { rootMargin: "-25% 0px -65% 0px" },
    );

    NAV.forEach((n) => {
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
      await fetch(`${BACKEND_URL}/`, {
        mode: "no-cors",
        signal: controller.signal,
      });
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

  function notify(message, tone = "success") {
    setToast(message);
    setToastTone(tone);
    window.setTimeout(() => setToast(""), 3500);
  }

  async function registerAudioCase(options = {}) {
    setAudioRegistrationError("");
    const sourceFile = options.file || file;
    const sourceTitle = options.caseTitle || caseTitle;
    const sourceSummary = options.summary ?? summary;
    const sourceSaved = options.saved ?? saved;
    const sourceEvidence = options.evidence ?? evidence;
    const sourceEvents = options.events ?? events;
    const transcriptSegments = options.analysis
      ? (options.analysis.segments || []).map((segment, index) => ({
          ...segment,
          id: index,
        }))
      : segments;
    const registeredEmotion =
      options.analysis?.emotion ||
      (options.liveCall
        ? {
            status: "failed",
            label: null,
            confidence: null,
            error:
              options.analysisError ||
              "Final recorded-call analysis did not return a result.",
          }
        : emotion);
    const registeredLanguage = options.analysis?.language || language;
    const preservedReviewFlags = options.liveCall?.reviewFlags || flags;
    const reviewFlags =
      options.analysis && options.liveCall
        ? preservedReviewFlags.flatMap((flag) => {
            const matchingIndex = transcriptSegments.findIndex(
              (segment) =>
                segment.text === flag.text &&
                Math.abs(segment.start - flag.start) <= 0.5 &&
                Math.abs(segment.end - flag.end) <= 0.5,
            );
            if (matchingIndex < 0) return [];
            const matchingSegment = transcriptSegments[matchingIndex];
            return [
              {
                ...flag,
                segmentId: matchingIndex,
                start: matchingSegment.start,
                end: matchingSegment.end,
              },
            ];
          })
        : preservedReviewFlags;
    const hasProvidedHash = Object.prototype.hasOwnProperty.call(
      options,
      "audioHash",
    );
    const registeredHash = hasProvidedHash ? options.audioHash : audioHash;
    const registeredHashStatus = hasProvidedHash
      ? registeredHash
        ? "SHA-256 recorded for this uploaded file"
        : "Hash calculation failed"
      : hashStatus;
    if (!sourceTitle.trim()) {
      setAudioRegistrationError("Enter a case title before registration.");
      notify("Enter a case title before registering the audio case.", "error");
      return { error: "Enter a case title before registration." };
    }
    const hasAnalysis =
      sourceSummary.trim() ||
      transcriptSegments.length ||
      sourceSaved.length ||
      registeredHash ||
      registeredEmotion?.label ||
      options.liveCall;
    if (!hasAnalysis) {
      setAudioRegistrationError(
        "Run an analysis or add case summary/evidence before registering.",
      );
      notify(
        "Add analysis results or a case summary before registration.",
        "error",
      );
      return {
        error:
          "Run an analysis or add case summary/evidence before registering.",
      };
    }
    if (audioRegistration && !options.liveCall) {
      return { error: "This audio case is already registered." };
    }

    let registrationId = options.liveCall ? "" : caseId.trim();
    let storedAudio = false;
    try {
      const stored = JSON.parse(
        localStorage.getItem(PRIORITY_CASES_KEY) || "[]",
      );
      if (!Array.isArray(stored))
        throw new Error("The saved case list is not valid.");
      const conflict = stored.some((item) => item.id === registrationId);
      if (!registrationId || conflict) {
        const prefix = options.liveCall ? "LIVE" : "AUD";
        registrationId = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
      }
      const registeredAt = new Date().toISOString();
      const eventDescription = options.liveCall
        ? options.liveCall.interrupted
          ? "Interrupted live call recording registered"
          : "Completed live call recording registered"
        : "Audio analysis registered as a case";
      const recordEvents = options.liveCall
        ? [
            ...sourceEvents,
            {
              id: crypto.randomUUID(),
              time: options.liveCall.endedAt,
              label: eventDescription,
              detail: sourceFile?.name || "",
            },
          ]
        : events;
      const audioRecord = {
        caseTitle: sourceTitle,
        caseId: registrationId,
        sourceFileName: sourceFile?.name || "",
        summary: sourceSummary,
        transcript: transcriptSegments.map((segment, index) => ({
          start: segment.start,
          end: segment.end,
          text: segment.text,
          flagged: reviewFlags.some(
            (flag) =>
              flag.segmentId === index &&
              flag.text === segment.text &&
              Math.abs(flag.start - segment.start) < 0.05 &&
              Math.abs(flag.end - segment.end) < 0.05,
          ),
        })),
        investigatorNotes: sourceSaved,
        evidence: sourceEvidence,
        flaggedSegments: preservedReviewFlags,
        audioHash: registeredHash,
        hashStatus: registeredHashStatus,
        language: registeredLanguage,
        automatedFinding: registeredEmotion,
        registrationStatus: "Registered",
        createdAt:
          options.liveCall?.startedAt || initial.createdAt || registeredAt,
        registeredAt,
        ...(options.liveCall
          ? {
              storageId: registrationId,
              liveCall: {
                ...options.liveCall,
                interimSegments: options.liveCall.interimSegments || [],
                interimEmotion: options.liveCall.interimEmotion || null,
                interimLanguage: options.liveCall.interimLanguage || "",
                interimWindows: options.liveCall.interimWindows || [],
                reviewFlags: preservedReviewFlags,
              },
            }
          : {}),
      };
      const caseRecord = {
        id: registrationId,
        complaintType: "Audio analysis",
        reportedAt: options.liveCall?.startedAt || registeredAt,
        registeredAt,
        registrationStatus: "Registered",
        sourceType: "audio",
        indicators: preservedReviewFlags.length
          ? [
              `${preservedReviewFlags.length} transcript segment${preservedReviewFlags.length === 1 ? "" : "s"} flagged for review`,
            ]
          : [],
        evidenceStatus: options.liveCall
          ? "Caller-only WAV saved in browser storage"
          : registeredHash
            ? "Audio hash recorded"
            : `${transcriptSegments.length} transcript segment${transcriptSegments.length === 1 ? "" : "s"} recorded`,
        evidence: [
          ...(registeredHash ? [`SHA-256: ${registeredHash}`] : []),
          ...(transcriptSegments.length
            ? [`Transcript: ${transcriptSegments.length} segments`]
            : []),
          ...(options.liveCall
            ? [
                `Caller audio WAV: ${sourceFile?.name || "filename unavailable"}`,
              ]
            : []),
          ...sourceSaved.map((note) => `Investigator note: ${note.text}`),
        ],
        officer: "Unassigned",
        status: "New",
        followUpDue: null,
        description:
          sourceSummary ||
          `${transcriptSegments.length} transcript segments are available for investigator review.`,
        priorityFactors: {
          safetyConcern: false,
          timeSensitiveFraud: false,
          ongoingActivity: false,
          affectedVictims: 1,
          evidenceUrgency: Boolean(sourceFile && !registeredHash),
          pendingAction: true,
        },
        priorityReason:
          "Audio analysis is registered for investigator review; automated results are not findings of fact.",
        recommendedNextSteps: [
          "Verify important transcript details against the original recording and review flagged segments.",
        ],
        audioRecord,
        timeline: options.liveCall
          ? [
              [options.liveCall.startedAt, "Live call started"],
              [
                options.liveCall.endedAt,
                options.liveCall.interrupted
                  ? "Live call interrupted"
                  : "Live call ended",
              ],
              [registeredAt, "Recorded-call analysis registered as a case"],
            ]
          : [[registeredAt, eventDescription]],
        notes: [],
      };
      const savedWorkspace = {
        caseTitle: sourceTitle,
        caseId: registrationId,
        summary: sourceSummary,
        saved: sourceSaved,
        evidence: sourceEvidence,
        events: recordEvents,
        flags: reviewFlags,
        audioHash: registeredHash,
        hashStatus: registeredHashStatus,
        audioRegistration: audioRecord,
      };
      if (options.liveCall && sourceFile) {
        await saveAudioEvidence(registrationId, sourceFile);
        storedAudio = true;
      }
      persistCaseRecord(caseRecord, {
        key: CASE_KEY,
        value: JSON.stringify(savedWorkspace),
      });
      setCaseId(registrationId);
      setCaseTitle(sourceTitle);
      setSummary(sourceSummary);
      setEvents(recordEvents);
      setFlags(reviewFlags);
      if (registeredHash) setAudioHash(registeredHash);
      setHashStatus(registeredHashStatus);
      setAudioRegistration(audioRecord);
      notify(`Audio case registered successfully · ${registrationId}`);
      return {
        caseId: registrationId,
        analysisStatus: registeredEmotion?.status || "unavailable",
      };
    } catch (error) {
      if (storedAudio) {
        try {
          await deleteAudioEvidence(registrationId);
        } catch (cleanupError) {
          console.error(
            "Could not remove audio evidence after the case save failed.",
            cleanupError,
          );
        }
      }
      console.error("Unable to register audio analysis as a case.", error);
      setAudioRegistrationError(error.message);
      notify(`${error.message} You can retry registration.`, "error");
      return { error: error.message };
    }
  }

  function pushEvent(label, detail = "") {
    setEvents((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        time: new Date().toISOString(),
        label,
        detail,
      },
    ]);
  }

  async function hashFile(f) {
    setAudioHash("");
    setHashStatus("Calculating SHA-256...");

    try {
      if (!window.crypto?.subtle) {
        setHashStatus("Hashing unavailable in this browser context");
        return null;
      }

      const bytes = await f.arrayBuffer();
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      const hash = Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      setAudioHash(hash);
      setHashStatus("SHA-256 recorded for this uploaded file");
      pushEvent("SHA-256 hash recorded", `${hash.slice(0, 16)}…`);
      return hash;
    } catch {
      setHashStatus("Hash calculation failed");
      return null;
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

  function upload(f, { notifyUser = true } = {}) {
    if (!f) return null;

    if (
      !f.type.startsWith("audio/") &&
      !/\.(wav|mp3|m4a|ogg|flac|webm|aac)$/i.test(f.name)
    ) {
      if (notifyUser) notify("Please choose a supported audio file.");
      return null;
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

    setEvidence((prev) =>
      prev.map((item) =>
        item.id === 1 ? { ...item, status: "collected" } : item,
      ),
    );

    pushEvent("Audio uploaded", f.name);

    const hashPromise = hashFile(f);
    computeWave(f);
    if (notifyUser) notify("Audio loaded. Run analysis when ready.");
    return hashPromise;
  }

  async function analyze(fileOverride = file, { notifyUser = true } = {}) {
    const analysisFile =
      fileOverride instanceof File
        ? fileOverride
        : file instanceof File
          ? file
          : null;
    if (!analysisFile) {
      if (notifyUser) {
        notify("Please upload an audio file first.");
        picker.current?.click();
      }
      return { data: null, error: "Please upload an audio file first." };
    }

    setLoading(true);
    setSegments([]);
    setEmotion(null);
    setAnalysisError("");
    pushEvent("Transcription requested", analysisFile.name);
    if (notifyUser)
      notify("Analyzing audio. The first model run may take longer.");

    try {
      const formData = new FormData();
      formData.append("file", analysisFile);

      const response = await fetch(`${BACKEND_URL}/transcribe`, {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        console.error("CyberMitra API error:", {
          status: response.status,
          response: data,
        });

        const detail = data.detail;
        const message =
          typeof detail === "string"
            ? detail
            : Array.isArray(detail)
              ? detail
                  .map((item) =>
                    typeof item === "string"
                      ? item
                      : `${item.loc?.join(".") || "Request"}: ${item.msg || JSON.stringify(item)}`,
                  )
                  .join("; ")
              : detail
                ? JSON.stringify(detail)
                : `Analysis failed with HTTP ${response.status}`;

        throw new Error(message);
      }

      console.log("CyberMitra transcription result:", data);

      const actualSegments = (data.segments || []).map((item, index) => ({
        start: item.start,
        end: item.end,
        text: item.text,
        id: index,
      }));

      setSegments(actualSegments);
      setSelected(0);
      setLanguage(data.language || "Unknown");
      const emotionResult =
        data.emotion &&
        ["completed", "partial", "failed"].includes(data.emotion.status)
          ? data.emotion
          : {
              status: "failed",
              label: null,
              confidence: null,
              analyzed_duration: 0,
              segments_analyzed: 0,
              total_segments: 0,
              segments: [],
              error: "The backend did not return a valid voice emotion result.",
            };
      setEmotion(emotionResult);
      setBackend("online");

      setEvents((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          time: new Date().toISOString(),
          label: "Audio analysis completed",
          detail: `${actualSegments.length} transcript segments; detected language: ${data.language || "unknown"}`,
        },
      ]);

      if (
        notifyUser &&
        ["completed", "partial"].includes(emotionResult.status)
      ) {
        notify(
          `Transcription completed. Voice emotion analysis ${emotionResult.status === "completed" ? "completed" : "partially completed"}.`,
          emotionResult.status === "completed" ? "success" : "error",
        );
      } else if (notifyUser) {
        notify(
          `Transcription completed. Voice emotion analysis failed: ${emotionResult.error || "No prediction was returned."}`,
          "error",
        );
      }
      return { data, error: null };
    } catch (error) {
      const message =
        error instanceof TypeError
          ? "Could not reach the backend at 127.0.0.1:8081. Start the Python server and try again."
          : error.message;
      if (error instanceof TypeError) setBackend("offline");
      setAnalysisError(message);
      setEmotion({
        status: "failed",
        label: null,
        confidence: null,
        analyzed_duration: 0,
        segments_analyzed: 0,
        total_segments: 0,
        segments: [],
        error: message,
      });
      pushEvent("Audio analysis failed", message);
      if (notifyUser) notify("Analysis failed: " + message);
      return { data: null, error: message };
    } finally {
      setLoading(false);
    }
  }

  async function createCaseFromLiveCall(callFile, liveCall) {
    const liveTitle = `Completed live call · ${new Date(liveCall.startedAt).toLocaleString()}`;
    const liveEvidence = defaultEvidence.map((item) =>
      item.id === 1
        ? { ...item, status: "collected" }
        : { ...item, status: "pending" },
    );
    setAudioRegistration(null);
    setCaseId("");
    setCaseTitle(liveTitle);
    setSummary("");
    setSaved([]);
    setEvidence(liveEvidence);
    setEvents([]);
    setFlags(liveCall.reviewFlags || []);
    setAudioHash("");
    setHashStatus("Calculating SHA-256...");

    const hashPromise = upload(callFile, { notifyUser: false });
    const analysisPromise = analyze(callFile, { notifyUser: false });
    const [audioFileHash, analysisResult] = await Promise.all([
      hashPromise || Promise.resolve(null),
      analysisPromise,
    ]);
    const analysisStatus = analysisResult.data?.emotion?.status || "failed";
    const finalSummary = [
      `Caller-only audio from a simulated live call (${liveCall.duration.toFixed(1)} seconds).`,
      analysisResult.error
        ? `Final recorded-call analysis failed: ${analysisResult.error}`
        : `Final recorded-call transcription returned ${analysisResult.data.segments?.length || 0} segments; voice emotion status: ${analysisStatus}.`,
    ].join(" ");
    const saveResult = await registerAudioCase({
      file: callFile,
      analysis: analysisResult.data,
      analysisError: analysisResult.error,
      audioHash: audioFileHash,
      caseTitle: liveTitle,
      summary: finalSummary,
      saved: [],
      evidence: liveEvidence,
      events: [],
      liveCall,
    });

    return saveResult.caseId
      ? {
          caseId: saveResult.caseId,
          analysisStatus,
          analysisSucceeded: Boolean(analysisResult.data),
        }
      : {
          error:
            saveResult.error || "The completed-call case could not be saved.",
        };
  }

  async function retryEmotionAnalysis() {
    if (!file || loading || emotionRetrying) return;

    setEmotionRetrying(true);
    setEmotion({
      status: "processing",
      label: null,
      confidence: null,
      analyzed_duration: 0,
      segments_analyzed: 0,
      total_segments: 0,
      segments: [],
      error: null,
    });

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append(
        "segments",
        JSON.stringify(segments.map(({ start, end }) => ({ start, end }))),
      );

      const response = await fetch(`${BACKEND_URL}/analyze-emotion`, {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || "Voice emotion retry failed.");
      }
      if (!data.emotion || typeof data.emotion.status !== "string") {
        throw new Error(
          "The backend returned an invalid voice emotion response.",
        );
      }

      setEmotion(data.emotion);
      if (["completed", "partial"].includes(data.emotion.status)) {
        pushEvent("Voice emotion analysis completed", data.emotion.label);
        notify(
          `Voice emotion analysis ${data.emotion.status === "completed" ? "completed" : "partially completed"}.`,
          data.emotion.status === "completed" ? "success" : "error",
        );
      } else {
        pushEvent(
          "Voice emotion analysis failed",
          data.emotion.error || "No prediction returned.",
        );
        notify(
          `Voice emotion analysis failed: ${data.emotion.error || "No prediction was returned."}`,
          "error",
        );
      }
    } catch (error) {
      const message = error.message || "Voice emotion retry failed.";
      setEmotion({
        status: "failed",
        label: null,
        confidence: null,
        analyzed_duration: 0,
        segments_analyzed: 0,
        total_segments: 0,
        segments: [],
        error: message,
      });
      pushEvent("Voice emotion analysis failed", message);
      notify(`Voice emotion analysis failed: ${message}`, "error");
    } finally {
      setEmotionRetrying(false);
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
      audio.current.currentTime = Math.max(
        0,
        Math.min(seconds, duration || seconds),
      );
    }
  }

  function onWaveClick(e) {
    if (!duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    seekTo(((e.clientX - rect.left) / rect.width) * duration);
  }

  function onWaveKey(e) {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      seekTo(currentTime + 5);
    }
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      seekTo(currentTime - 5);
    }
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
      createdAt: new Date().toISOString(),
    };

    setSaved((prev) => [...prev, note]);
    pushEvent("Investigator note added", note.text);

    setNotes("");
    notify("Note saved in this browser.");
  }

  function toggleFlag(segment, index) {
    const exists = flags.some((f) => f.segmentId === index);

    if (exists) {
      setFlags((prev) => prev.filter((f) => f.segmentId !== index));
      pushEvent(
        "Segment unflagged",
        `${time(segment.start)}–${time(segment.end)}`,
      );
      notify("Review flag removed.");
    } else {
      setFlags((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          segmentId: index,
          start: segment.start,
          end: segment.end,
          text: segment.text,
          reason: "Needs manual verification",
        },
      ]);
      pushEvent(
        "Segment flagged for review",
        `${time(segment.start)}–${time(segment.end)}`,
      );
      notify("Segment flagged for review.");
    }
  }

  function updateEvidence(id, status) {
    setEvidence((prev) =>
      prev.map((item) => (item.id === id ? { ...item, status } : item)),
    );
  }

  function addEvent() {
    const label = window.prompt("Enter the incident event:");
    if (!label?.trim()) return;
    const detail = window.prompt("Add details (optional):") || "";

    pushEvent(label.trim(), detail.trim());
    notify("Timeline event added.");
  }

  function removeEvent(id) {
    setEvents((prev) => prev.filter((event) => event.id !== id));
  }

  async function copyHash() {
    if (!audioHash) return;
    try {
      await navigator.clipboard.writeText(audioHash);
      notify("SHA-256 hash copied.");
    } catch {
      notify(
        "Copy is not available here. Select the hash and copy it manually.",
      );
    }
  }

  function report() {
    const confidence = Number.isFinite(emotion?.confidence)
      ? `${(emotion.confidence * 100).toFixed(2)}%`
      : "Unavailable";
    const reportFlags = audioRegistration?.liveCall?.reviewFlags || flags;

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
      ...(audioRegistration?.liveCall
        ? [
            "",
            "LIVE CALL CAPTURE (CALLER TRACK ONLY)",
            `Started: ${fmtDate(audioRegistration.liveCall.startedAt)}`,
            `Ended: ${fmtDate(audioRegistration.liveCall.endedAt)}`,
            `Captured duration: ${audioRegistration.liveCall.duration.toFixed(2)} seconds`,
            `PCM format: ${audioRegistration.liveCall.sampleRate} Hz, ${audioRegistration.liveCall.channels} channel, ${audioRegistration.liveCall.encoding}`,
            `Call ended normally: ${audioRegistration.liveCall.interrupted ? "No; interrupted" : "Yes"}`,
            `Recording truncated at limit: ${audioRegistration.liveCall.truncated ? "Yes" : "No"}`,
            "Live interim output is provisional; the transcript and model results below are from final full-recording analysis.",
            "",
            "LIVE INTERIM TRANSCRIPT",
            ...(audioRegistration.liveCall.interimSegments.length
              ? audioRegistration.liveCall.interimSegments.map(
                  (segment) =>
                    `[${time(segment.start)}–${time(segment.end)}] ${segment.text}`,
                )
              : ["No interim transcript segments returned."]),
            "INTERIM EMOTION MODEL OUTPUTS BY WINDOW",
            ...(audioRegistration.liveCall.interimWindows?.length
              ? audioRegistration.liveCall.interimWindows.map((window) => {
                  const interimEmotion = window.emotion;
                  return [
                    `[${time(window.windowStart)}–${time(window.windowStart + window.windowDuration)}]`,
                    `language=${window.language || "Unavailable"}`,
                    `model=${interimEmotion?.model || "Unavailable"}`,
                    `revision=${interimEmotion?.model_revision || "Unavailable"}`,
                    `status=${interimEmotion?.status || "Unavailable"}`,
                    `label=${interimEmotion?.label || "Unavailable"}`,
                    `confidence=${Number.isFinite(interimEmotion?.confidence) ? interimEmotion.confidence : "Unavailable"}`,
                    `error=${interimEmotion?.error || "None"}`,
                    ...(interimEmotion?.segments || []).map(
                      (segment) =>
                        `  ${time(window.windowStart + segment.start)}–${time(window.windowStart + segment.end)}: ${segment.label || segment.status}${Number.isFinite(segment.confidence) ? ` (${(segment.confidence * 100).toFixed(1)}%)` : ""}${segment.error ? ` — ${segment.error}` : ""}`,
                    ),
                  ].join(" ");
                })
              : ["No live interim emotion windows returned."]),
            `Interim emotion result: ${audioRegistration.liveCall.interimEmotion?.label || "Unavailable"}`,
            `Interim emotion status: ${audioRegistration.liveCall.interimEmotion?.status || "Unavailable"}`,
            `Interim language: ${audioRegistration.liveCall.interimLanguage || "Unavailable"}`,
          ]
        : []),
      "",
      "TRANSCRIPT (AUTOMATED, BACKEND)",
      ...segments.map((s) => `[${time(s.start)}–${time(s.end)}] ${s.text}`),
      "",
      "VOICE EMOTION MODEL (AUTOMATED, BACKEND)",
      `Predicted label: ${emotion?.label || "Unavailable"}`,
      `Model confidence score: ${confidence}`,
      `Analyzed speech duration: ${Number.isFinite(emotion?.analyzed_duration) ? `${emotion.analyzed_duration.toFixed(1)} seconds` : "Unavailable"}`,
      `Speech intervals analyzed: ${emotion?.segments_analyzed ?? 0} / ${emotion?.total_segments ?? 0}`,
      `Status: ${emotion?.status || "Unavailable"}`,
      `Analysis error: ${emotion?.error || "None"}`,
      ...(emotion?.segments || []).map(
        (segment) =>
          `${time(segment.start)}–${time(segment.end)}: ${segment.label || segment.status}${Number.isFinite(segment.confidence) ? ` (${(segment.confidence * 100).toFixed(1)}%)` : ""}${segment.error ? ` — ${segment.error}` : ""}`,
      ),
      "",
      "SPEAKER VERIFICATION AND ANTI-SPOOFING",
      "Voiceprint matching: Not run (no backend integration connected).",
      "Synthetic-audio / anti-spoofing detection: Not run (no backend integration connected).",
      "",
      "IMPORTANT AI LIMITATIONS",
      "Voice emotion is an uncertain acoustic estimate, not proof of deception, guilt, victim status, intent, or whether a crime occurred.",
      "The Wav2Vec2 emotion model is English-trained; predictions for other languages may be unreliable.",
      "Model confidence is not the probability that a person is telling the truth.",
      "Verify all findings against the original recording and independent evidence.",
      "",
      "EVIDENCE CHECKLIST (INVESTIGATOR-UPDATED)",
      ...evidence.map((item) => `[${item.status.toUpperCase()}] ${item.name}`),
      "",
      "REVIEW FLAGS (INVESTIGATOR-ENTERED)",
      ...(reportFlags.length
        ? reportFlags.map(
            (f) => `[${time(f.start)}–${time(f.end)}] ${f.reason}: ${f.text}`,
          )
        : ["No transcript segments flagged."]),
      "",
      "INVESTIGATOR NOTES (INVESTIGATOR-ENTERED)",
      ...(saved.length
        ? saved.map((n) => `[${time(n.time)}] ${n.text}`)
        : ["No notes recorded."]),
      "",
      "INCIDENT TIMELINE",
      ...events.map(
        (e) =>
          `[${fmtDate(e.time)}] ${e.label}${e.detail ? ": " + e.detail : ""}`,
      ),
      "",
      "INTEGRITY NOTE",
      "The SHA-256 hash identifies the bytes of the uploaded file at the time of hashing. It does not establish the recording's origin, chain of custody, or authenticity before upload.",
    ].join("\n");

    const blobUrl = URL.createObjectURL(
      new Blob([content], { type: "text/plain;charset=utf-8" }),
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
    .filter((s) => (s.text || "").toLowerCase().includes(search.toLowerCase()))
    .filter((s) => !onlyFlagged || flags.some((f) => f.segmentId === s.i));

  const confidenceAvailable = Number.isFinite(emotion?.confidence);
  const confidencePercent = confidenceAvailable
    ? `${(emotion.confidence * 100).toFixed(1)}%`
    : "Unavailable";

  const emotionStatus =
    loading || emotionRetrying || emotion?.status === "processing"
      ? "Analysis in progress"
      : emotion?.status === "completed"
        ? "Completed"
        : emotion?.status === "partial"
          ? "Partially completed"
          : emotion?.status === "failed"
            ? "Failed"
            : emotion?.status === "processing"
              ? "Analysis in progress"
              : "Not analysed";

  const collectedCount = evidence.filter(
    (e) => e.status === "collected",
  ).length;
  const pendingCount = evidence.filter((e) => e.status === "pending").length;
  const evidencePct = evidence.length
    ? (collectedCount / evidence.length) * 100
    : 0;

  const audioStatus = loading
    ? "Analysis running"
    : !file
      ? "No audio loaded"
      : segments.length
        ? "Transcript ready"
        : analysisError
          ? "Analysis failed"
          : "Analysis pending";

  const highPriorityCases = upiCases.filter((c) =>
    analyzeUPICase(c)?.level.startsWith("High"),
  ).length;

  const timelineItems = [
    ...events.map((e) => ({ ...e, source: "Audio case" })),
    ...upiCases
      .filter((c) => c.createdAt)
      .map((c) => ({
        id: `upi-${c.id}`,
        time: c.createdAt,
        label: "UPI case created",
        detail: `${c.title || "Untitled"} (${c.id})`,
        source: "UPI",
        readonly: true,
      })),
  ].sort(
    (a, b) =>
      (new Date(a.time).getTime() || 0) - (new Date(b.time).getTime() || 0),
  );

  const notPerformed = [
    "Voiceprint / speaker match: not connected",
    "Synthetic-audio detection: not connected",
    ...evidence
      .filter((e) => [2, 3, 4].includes(e.id) && e.status === "pending")
      .map((e) => `${e.name}: pending`),
  ];

  const MAX_UPI_SCORE = Object.values(UPI_INDICATOR_RULES).reduce(
    (t, r) => t + r.points,
    0,
  );

  const upiScores = upiCases.slice(0, 8).map((c) => {
    const a = analyzeUPICase(c);
    return {
      id: c.id,
      title: c.title || "Untitled case",
      score: a.score,
      slug: levelSlug(a.level),
    };
  });

  const unavailableCount = evidence.filter(
    (e) => e.status === "unavailable",
  ).length;
  const donutParts = [
    {
      key: "collected",
      label: "Collected",
      value: collectedCount,
      color: "#39dfac",
    },
    { key: "pending", label: "Pending", value: pendingCount, color: "#ffb547" },
    {
      key: "unavailable",
      label: "Unavailable",
      value: unavailableCount,
      color: "#6f8fa1",
    },
  ];
  const DONUT_R = 40;
  const DONUT_C = 2 * Math.PI * DONUT_R;
  let donutOffset = 0;
  const donutArcs = donutParts
    .filter((p) => p.value > 0)
    .map((p) => {
      const len = (p.value / Math.max(1, evidence.length)) * DONUT_C;
      const arc = { ...p, len, offset: donutOffset };
      donutOffset += len;
      return arc;
    });

  const progress = duration ? Math.min(1, currentTime / duration) : 0;

  const backendLabel =
    backend === "online"
      ? "Backend reachable"
      : backend === "offline"
        ? "Backend not reachable"
        : "Checking backend";

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">
            <AudioLines />
          </div>
          <div>
            <b>CyberMitra</b>
            <small>Digital evidence workspace</small>
          </div>
        </div>

        <label>Workspace</label>
        {NAV.map((item) => {
          const Icon = item.icon;
          const count =
            item.id === "upi"
              ? upiCases.length
              : item.id === "timeline"
                ? timelineItems.length
                : null;
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
          <div className="progress">
            <i style={{ width: `${evidencePct}%` }} />
          </div>
          <small>
            Evidence items{" "}
            <strong>
              {collectedCount}/{evidence.length}
            </strong>
          </small>
        </div>

        <div className="side-bottom">
          <LockKeyhole size={14} /> Local prototype workspace
        </div>
      </aside>

      <main>
        <header>
          <div className="crumbs">
            Investigations <ChevronRight size={14} /> <b>{caseId}</b>
          </div>
          <div className="headstatus">
            <span
              className="chip"
              data-tone={
                backend === "online"
                  ? "ok"
                  : backend === "offline"
                    ? "bad"
                    : "idle"
              }
            >
              {backend === "offline" ? (
                <WifiOff size={13} />
              ) : (
                <Wifi size={13} />
              )}{" "}
              {backendLabel}
            </span>
            <button
              className="iconbtn"
              onClick={checkBackend}
              title="Re-check backend connection"
              aria-label="Re-check backend connection"
            >
              <RefreshCw size={14} />
            </button>
            <span
              className="chip"
              data-tone={
                loading
                  ? "info"
                  : audioStatus === "Transcript ready"
                    ? "ok"
                    : audioStatus === "Analysis failed"
                      ? "bad"
                      : "warn"
              }
            >
              <ShieldCheck size={13} /> {audioStatus}
            </span>
            <button className="secondary small" onClick={report}>
              <Download size={13} /> Export report
            </button>
          </div>
        </header>

        <nav className="mobilenav" aria-label="Sections">
          {NAV.map((item) => {
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

        <CasePriorityPage />

        {/* ---------- OVERVIEW ---------- */}
        <section className="heading" id="overview">
          <div>
            <small className="eyebrow">Investigation workspace</small>
            <h1>Audio and UPI evidence review</h1>
            <p>
              Transcribe recordings, check transactions and organize evidence
              for manual review.
            </p>
          </div>
        </section>

        <div className="metrics">
          <article>
            <small>Saved UPI cases</small>
            <b>{upiCases.length}</b>
            <p>
              {upiCases.length
                ? `${highPriorityCases} with high review priority`
                : "No UPI cases yet"}
            </p>
          </article>
          <article>
            <small>Audio processing</small>
            <b>{audioStatus}</b>
            <p>
              {file
                ? `${file.name} · ${(file.size / 1048576).toFixed(2)} MB`
                : "Upload a recording to begin"}
            </p>
          </article>
          <article>
            <small>Transcript segments</small>
            <b>{segments.length || "N/A"}</b>
            <p>
              {language
                ? `Detected language: ${language}`
                : "Waiting for analysis"}
            </p>
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
            <p>
              {collectedCount} of {evidence.length} checklist items collected
            </p>
          </article>
        </div>

        <section className="panel analytics">
          <div className="panelhead">
            <div>
              <h2>
                <Activity size={17} /> Investigation analytics
              </h2>
              <p>
                Calculated from the UPI cases and checklist saved in this
                browser.
              </p>
            </div>
          </div>

          <div className="charts">
            <div className="chart">
              <h3>UPI review-priority score by case</h3>
              {upiScores.length ? (
                <>
                  <div className="hbars">
                    {upiScores.map((c) => (
                      <div className="hbar" key={c.id}>
                        <span
                          className="hbar-label"
                          title={`${c.title} (${c.id})`}
                        >
                          {c.title}
                        </span>
                        <div className="hbar-track">
                          <i
                            data-level={c.slug}
                            style={{
                              width: `${(c.score / MAX_UPI_SCORE) * 100}%`,
                            }}
                          />
                          <u
                            style={{ left: `${(4 / MAX_UPI_SCORE) * 100}%` }}
                          />
                          <u
                            style={{ left: `${(7 / MAX_UPI_SCORE) * 100}%` }}
                          />
                        </div>
                        <b className="mono">{c.score}</b>
                      </div>
                    ))}
                  </div>
                  <p className="chart-note">
                    Points from the rule-based score (maximum {MAX_UPI_SCORE}).
                    Vertical lines mark the moderate (4) and high (7) review
                    thresholds. This is not a probability of fraud.
                  </p>
                </>
              ) : (
                <p className="empty">
                  Create a UPI case to see its score here.
                </p>
              )}
            </div>

            <div className="chart">
              <h3>Evidence checklist status</h3>
              <div className="donutwrap">
                <svg
                  viewBox="0 0 100 100"
                  className="donut"
                  role="img"
                  aria-label={`${collectedCount} collected, ${pendingCount} pending, ${unavailableCount} unavailable`}
                >
                  <circle
                    cx="50"
                    cy="50"
                    r={DONUT_R}
                    fill="none"
                    stroke="#143447"
                    strokeWidth="11"
                  />
                  {donutArcs.map((a) => (
                    <circle
                      key={a.key}
                      cx="50"
                      cy="50"
                      r={DONUT_R}
                      fill="none"
                      stroke={a.color}
                      strokeWidth="11"
                      strokeDasharray={`${a.len} ${DONUT_C - a.len}`}
                      strokeDashoffset={-a.offset}
                      transform="rotate(-90 50 50)"
                    />
                  ))}
                  <text x="50" y="49" textAnchor="middle" className="donut-num">
                    {collectedCount}/{evidence.length}
                  </text>
                  <text x="50" y="62" textAnchor="middle" className="donut-sub">
                    collected
                  </text>
                </svg>
                <ul className="donut-legend">
                  {donutParts.map((p) => (
                    <li key={p.key}>
                      <i style={{ background: p.color }} /> {p.label}{" "}
                      <b className="mono">{p.value}</b>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        <section className="panel case-editor" id="audio-case-details">
          <div className="panelhead">
            <div>
              <h2>
                <FolderOpen size={17} /> Case details
              </h2>
              <p>Changes save in this browser.</p>
            </div>
            <small className="tag">Investigator-entered</small>
          </div>
          <div className="case-fields">
            <label>
              Case ID
              <input
                value={caseId}
                onChange={(e) => setCaseId(e.target.value)}
              />
            </label>
            <label>
              Case title
              <input
                value={caseTitle}
                onChange={(e) => setCaseTitle(e.target.value)}
              />
            </label>
          </div>
          <label className="fieldlabel">Case summary</label>
          <textarea
            rows="4"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="Record a neutral summary of the reported incident. Separate verified facts from allegations and unknown details."
          />
        </section>

        {/* ---------- UPI ---------- */}
        <div className="section-gap" />
        <UPIInvestigation notify={notify} onCasesChange={setUpiCases} />

        {/* ---------- AUDIO FORENSICS ---------- */}
        <section className="sectionhead" id="audio">
          <div>
            <small className="eyebrow">Audio forensics</small>
            <h2>Recording analysis</h2>
            <p>
              Observed content, automated results and investigator conclusions
              are kept separate.
            </p>
          </div>
        </section>

        <LiveCall
          role="investigator"
          onCompleted={createCaseFromLiveCall}
          onViewCase={viewAudioCase}
        />

        <section className="casebar">
          <div className="caseicon">
            <FileAudio />
          </div>
          <div className="caseinfo">
            <b>{caseTitle}</b>
            <small>
              <span className="mono">{caseId}</span> · <Clock3 size={12} />{" "}
              Local prototype · <LockKeyhole size={12} /> Restricted
            </small>
          </div>
          <button className="primary" onClick={() => picker.current?.click()}>
            <Plus size={15} /> Upload audio
          </button>
          <input
            ref={picker}
            hidden
            type="file"
            accept="audio/*"
            onChange={(e) => {
              upload(e.target.files[0]);
              e.target.value = "";
            }}
          />
        </section>

        <div className="grid">
          <div className="left">
            <section className="panel">
              <div className="panelhead">
                <div>
                  <h2>
                    <Headphones size={17} /> Audio evidence player
                  </h2>
                  <p>Listen to the original recording</p>
                </div>
                <small className="tag">Original file</small>
              </div>
              <div className="audiofile">
                <div className="fileicon">
                  <AudioLines />
                </div>
                <div>
                  <b>{file ? file.name : "No audio selected"}</b>
                  <small>
                    {file
                      ? `${(file.size / 1048576).toFixed(2)} MB · ${file.type || "type unknown"}${duration ? ` · ${time(duration)}` : ""}`
                      : "Choose an audio file"}
                  </small>
                </div>
                <button
                  className="iconbtn"
                  onClick={() => picker.current?.click()}
                  title="Upload audio"
                  aria-label="Upload audio"
                >
                  <UploadCloud size={17} />
                </button>
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
                      <i
                        key={i}
                        className={
                          i / waveform.length < progress ? "played" : ""
                        }
                        style={{ height: `${Math.round(h * 100)}%` }}
                      />
                    ))}
                    {duration > 0 &&
                      flags.map((f) => (
                        <span
                          key={f.id}
                          className="wave-mark"
                          title={`Flagged ${time(f.start)}–${time(f.end)}`}
                          style={{
                            left: `${(f.start / duration) * 100}%`,
                            width: `${Math.max(0.6, ((f.end - f.start) / duration) * 100)}%`,
                          }}
                        />
                      ))}
                    <span
                      className="wave-head"
                      style={{ left: `${progress * 100}%` }}
                    />
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
                <div className="wave-times mono">
                  <span>{time(currentTime)}</span>
                  <span>{duration ? time(duration) : "--:--"}</span>
                </div>
              </div>

              {url && (
                <audio
                  ref={audio}
                  controls
                  src={url}
                  onLoadedMetadata={(e) =>
                    setDuration(e.currentTarget.duration || 0)
                  }
                  onTimeUpdate={(e) =>
                    setCurrentTime(e.currentTarget.currentTime)
                  }
                />
              )}
              <div className="audiobottom">
                <small>
                  ● {file ? "Original file loaded" : "Waiting for upload"}
                </small>
                <button onClick={() => picker.current?.click()}>
                  Replace audio
                </button>
              </div>
              <div className="notice">
                <div>
                  <b>
                    {loading ? "Analyzing recording..." : "Ready to analyze?"}
                  </b>
                  <small>
                    Transcription and voice classification run on your Python
                    backend.
                  </small>
                </div>
                <button
                  className="primary"
                  onClick={analyze}
                  disabled={loading}
                >
                  <Sparkles size={14} />
                  {loading ? "Analyzing..." : "Run analysis"}
                </button>
              </div>
              {analysisError && (
                <div className="errorbox" role="alert">
                  <ShieldAlert size={15} /> {analysisError}
                </div>
              )}
            </section>

            <section className="panel">
              <div className="panelhead">
                <div>
                  <h2>
                    <Activity size={17} /> Transcript timeline
                  </h2>
                  <p>Select a segment to replay or flag it for review</p>
                </div>
                <small className="tag">Automated</small>
              </div>
              {segments.length ? (
                <>
                  <div className="timeline">
                    {segments.map((s, i) => {
                      const flagged = flags.some((f) => f.segmentId === i);
                      return (
                        <button
                          key={i}
                          className={`${flagged ? "amber" : "blue"}${selected === i ? " selected" : ""}`}
                          onClick={() => jump(s, i)}
                        >
                          <b>{time(s.start)}</b>
                          <small>
                            {flagged ? "Flagged" : `Segment ${i + 1}`}
                          </small>
                        </button>
                      );
                    })}
                  </div>
                  {seg && (
                    <div className="selected">
                      <span
                        className={`badge ${flags.some((f) => f.segmentId === selected) ? "amber" : "blue"}`}
                      >
                        {flags.some((f) => f.segmentId === selected)
                          ? "Flagged"
                          : "Speech"}
                      </span>
                      <div>
                        <b>
                          {time(seg.start)} – {time(seg.end)}
                        </b>
                        <p>{seg.text}</p>
                      </div>
                      <button
                        className="secondary small"
                        onClick={() => jump(seg, selected)}
                      >
                        <Play size={12} /> Replay
                      </button>
                      <button
                        className="secondary small"
                        onClick={() => toggleFlag(seg, selected)}
                      >
                        <Flag size={12} />
                        {flags.some((f) => f.segmentId === selected)
                          ? "Unflag"
                          : "Flag"}
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <p className="empty">
                  {loading
                    ? "Analyzing recording. Segments will appear here."
                    : "Upload audio and run analysis to generate the transcript timeline."}
                </p>
              )}
              <p className="disclaimer">
                Transcription can make mistakes. Verify important details
                against the original recording.
              </p>
            </section>

            <section className="panel">
              <div className="panelhead">
                <div>
                  <h2>
                    <Search size={17} /> Transcript
                  </h2>
                  <p>Search recognized speech</p>
                </div>
                <small className="tag">Automated</small>
              </div>
              <div className="searchrow">
                <div className="search">
                  <Search size={14} />
                  <input
                    placeholder="Search transcript..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    aria-label="Search transcript"
                  />
                </div>
                <button
                  className={`secondary small togglebtn ${onlyFlagged ? "on" : ""}`}
                  onClick={() => setOnlyFlagged((v) => !v)}
                  aria-pressed={onlyFlagged}
                >
                  <Flag size={12} /> Flagged only
                </button>
              </div>
              <div className="transcripts">
                {filtered.map((s) => {
                  const flagged = flags.some((f) => f.segmentId === s.i);
                  return (
                    <button
                      key={s.i}
                      className={`${selected === s.i ? "chosen" : ""}${flagged ? " flagged" : ""}`}
                      onClick={() => jump(s, s.i)}
                    >
                      <small>{time(s.start)}</small>
                      <span>
                        {s.text}
                        <em className={flagged ? "amber" : "blue"}>
                          {flagged ? "Flagged for review" : "Transcribed"}
                        </em>
                      </span>
                    </button>
                  );
                })}
                {!filtered.length && (
                  <p className="empty">
                    {segments.length
                      ? "No segments match the current search or filter."
                      : loading
                        ? "Analyzing recording..."
                        : "Transcript will appear here after analysis."}
                  </p>
                )}
              </div>
              <footer>
                {segments.length} segments{" "}
                <span>
                  {language ? `Language: ${language}` : "No transcript yet"}
                </span>
              </footer>
            </section>
          </div>

          <div className="right">
            <section className="panel">
              <div className="panelhead">
                <div>
                  <h2>
                    <Activity size={17} /> Voice emotion report
                  </h2>
                  <p>
                    {audioRegistration?.liveCall
                      ? "Final completed-call analysis"
                      : "Speech-segment acoustic estimate"}
                  </p>
                </div>
                <small className="tag">Wav2Vec2</small>
              </div>
              <div className="emotion-result">
                <div className="emotion-symbol">
                  <AudioLines size={24} />
                </div>
                <div className="emotion-main">
                  <small>Predicted emotion</small>
                  <h3>
                    {loading || emotionRetrying
                      ? "Analyzing..."
                      : emotion?.label ||
                        (emotion?.status === "failed"
                          ? "Unavailable"
                          : "Not analysed")}
                  </h3>
                  <p>{emotionStatus}</p>
                </div>
              </div>
              <div className="emotion-confidence">
                <div>
                  <span>Model confidence score</span>
                  <b>{confidencePercent}</b>
                </div>
                <div className="confidence-track">
                  <div
                    className="confidence-fill"
                    style={{
                      width: confidenceAvailable
                        ? `${Math.max(0, Math.min(100, emotion.confidence * 100))}%`
                        : "0%",
                    }}
                  />
                </div>
              </div>
              {Number.isFinite(emotion?.analyzed_duration) &&
                emotion.analyzed_duration > 0 && (
                  <p className="emotion-duration">
                    Analyzed speech: {emotion.analyzed_duration.toFixed(1)}{" "}
                    seconds
                  </p>
                )}
              {emotion && (
                <p className="emotion-duration">
                  {emotion.segments_analyzed || 0} of{" "}
                  {emotion.total_segments || 0} speech intervals analysed
                </p>
              )}
              {emotion?.error && (
                <div className="errorbox emotion-error" role="alert">
                  <ShieldAlert size={15} /> {emotion.error}
                </div>
              )}
              {["failed", "partial"].includes(emotion?.status) && file && (
                <button
                  className="secondary emotion-retry"
                  type="button"
                  onClick={retryEmotionAnalysis}
                  disabled={loading || emotionRetrying}
                >
                  {emotionRetrying ? "Retrying..." : "Retry emotion analysis"}
                </button>
              )}
              {emotion?.segments?.length > 0 && (
                <div
                  className="emotion-segments"
                  aria-label="Emotion results by audio interval"
                >
                  {emotion.segments.map((item, index) => (
                    <div
                      className="emotion-segment"
                      key={`${item.start}-${item.end}-${index}`}
                    >
                      <span>
                        {time(item.start)}–{time(item.end)}
                      </span>
                      <b>
                        {item.label ||
                          (item.status === "skipped" ? "Skipped" : "Failed")}
                      </b>
                      <small>
                        {Number.isFinite(item.confidence)
                          ? `${(item.confidence * 100).toFixed(1)}%`
                          : item.error || item.status}
                      </small>
                    </div>
                  ))}
                </div>
              )}
              <p className="emotion-note">
                This English-trained model estimates acoustic vocal emotion; it
                is uncertain and is not proof of deception, guilt, victim
                status, intent or whether a crime occurred. Predictions for
                other languages may be unreliable.
              </p>
            </section>

            <section className="panel">
              <div className="panelhead">
                <div>
                  <h2>
                    <ClipboardCheck size={17} /> Findings summary
                  </h2>
                  <p>Where each finding comes from</p>
                </div>
              </div>
              <div className="findings">
                <div className="finding" data-kind="observed">
                  <small>Observed transcript</small>
                  <p>
                    {segments.length
                      ? `${segments.length} segments recognized${language ? ` in ${language}` : ""}.`
                      : "No transcript yet."}
                  </p>
                </div>
                <div className="finding" data-kind="auto">
                  <small>Automated (backend)</small>
                  <p>
                    {emotion?.status === "partial"
                      ? `Voice emotion analysis was partially completed: ${emotion.segments_analyzed} of ${emotion.total_segments} intervals were analyzed${emotion.label ? `; overall estimate ${emotion.label}${confidenceAvailable ? ` at ${confidencePercent} duration-weighted model confidence` : ""}` : ""}. ${emotion.error || ""}`
                      : emotion?.label && emotion?.status === "completed"
                        ? `Voice emotion estimate: ${emotion.label}${confidenceAvailable ? ` at ${confidencePercent} duration-weighted model confidence` : ""}, from ${emotion.segments_analyzed} of ${emotion.total_segments} speech intervals (${Number.isFinite(emotion.analyzed_duration) ? `${emotion.analyzed_duration.toFixed(1)} seconds` : "duration unavailable"}). This uncertain acoustic estimate is not proof of deception, guilt, victim status, intent or whether a crime occurred.`
                        : emotion?.status === "failed"
                          ? `Voice emotion analysis failed: ${emotion.error || "No prediction was returned."}`
                          : "No automated results yet."}
                  </p>
                </div>
                <div className="finding" data-kind="manual">
                  <small>Investigator</small>
                  <p>
                    {flags.length} flagged segment
                    {flags.length === 1 ? "" : "s"} · {saved.length} note
                    {saved.length === 1 ? "" : "s"} recorded.
                  </p>
                </div>
                <div className="finding" data-kind="todo">
                  <small>Not yet performed</small>
                  <ul>
                    {notPerformed.map((n) => (
                      <li key={n}>{n}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </section>

            <section className="panel">
              <div className="panelhead">
                <div>
                  <h2>
                    <Mic size={17} /> Voiceprint and anti-spoofing
                  </h2>
                  <p>Speaker verification and synthetic-audio checks</p>
                </div>
                <small className="tag" data-tone="warn">
                  Not connected
                </small>
              </div>
              <div className="verif">
                <div>
                  <b>Voiceprint match</b>
                  <span className="chip" data-tone="idle">
                    Analysis not run
                  </span>
                  <p>
                    No speaker-verification service is connected, so no match
                    result exists. A reference voice sample and a
                    speaker-embedding model on the backend would be required.
                  </p>
                </div>
                <div>
                  <b>Synthetic-audio detection</b>
                  <span className="chip" data-tone="idle">
                    Analysis not run
                  </span>
                  <p>
                    No anti-spoofing model is connected. A backend endpoint
                    returning a spoof-detection label and score would be
                    required before this can show a result.
                  </p>
                </div>
              </div>
              <button
                className="secondary full"
                disabled
                title="Requires backend integration"
              >
                Run voice checks (not available)
              </button>
            </section>

            <section className="panel">
              <div className="panelhead">
                <div>
                  <h2>
                    <FileText size={17} /> Investigator notes
                  </h2>
                  <p>Observations are saved in this browser</p>
                </div>
                <small className="tag">{saved.length}</small>
              </div>
              <label className="fieldlabel">
                Note for {seg ? time(seg.start) : "00:00"} segment
              </label>
              <textarea
                rows="3"
                placeholder="Write a neutral observation..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
              <button className="primary full" onClick={addNote}>
                <Plus size={14} /> Add note
              </button>
              <div className="saved">
                {saved.map((n) => (
                  <div key={n.id}>
                    <small>{time(n.time)}</small>
                    <p>{n.text}</p>
                  </div>
                ))}
                {!saved.length && (
                  <p className="empty">No notes recorded yet.</p>
                )}
              </div>
            </section>

            <section className="panel">
              <div className="panelhead">
                <div>
                  <h2>
                    <Flag size={17} /> Review flags
                  </h2>
                  <p>Transcript sections requiring human review</p>
                </div>
                <small className="tag">{flags.length}</small>
              </div>
              <div className="flaglist">
                {flags.map((f) => (
                  <div className="review-flag" key={f.id}>
                    <div>
                      <b>
                        {time(f.start)}–{time(f.end)}
                      </b>
                      <p>{f.text}</p>
                      <small>{f.reason}</small>
                    </div>
                    <button
                      className="iconbtn"
                      onClick={() =>
                        setFlags((prev) => prev.filter((x) => x.id !== f.id))
                      }
                      title="Remove flag"
                      aria-label="Remove flag"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
              {!flags.length && (
                <p className="empty">
                  Select a transcript segment and choose Flag to add one.
                </p>
              )}
            </section>
          </div>
        </div>

        {/* ---------- REPORTS ---------- */}
        <section className="sectionhead" id="reports">
          <div>
            <small className="eyebrow">Reports</small>
            <h2>Export findings</h2>
            <p>
              Reports label automated results and investigator entries
              separately.
            </p>
          </div>
        </section>

        <div className="twocol">
          <section className="panel">
            <div className="panelhead">
              <div>
                <h2>
                  <FileText size={17} /> Audio investigation report
                </h2>
                <p>Plain-text export</p>
              </div>
              <small className="tag">.txt</small>
            </div>
            <ul className="checks">
              <li data-ok={!!file}>
                Source audio {file ? "loaded" : "not loaded"}
              </li>
              <li data-ok={!!audioHash}>
                SHA-256 {audioHash ? "recorded" : "not available"}
              </li>
              <li data-ok={segments.length > 0}>
                Transcript {segments.length ? "available" : "not available"}
              </li>
              <li data-ok={saved.length > 0}>
                {saved.length} investigator note{saved.length === 1 ? "" : "s"}
              </li>
            </ul>
            <button className="primary full" onClick={report}>
              <Download size={14} /> Export audio report
            </button>
            <button
              className="secondary full"
              type="button"
              onClick={registerAudioCase}
              disabled={!!audioRegistration}
            >
              <ClipboardCheck size={14} />{" "}
              {audioRegistration
                ? "Case Registered"
                : "Register audio analysis as case"}
            </button>
            {audioRegistrationError && (
              <small className="field-error" role="alert">
                {audioRegistrationError}
              </small>
            )}
          </section>

          <section className="panel">
            <div className="panelhead">
              <div>
                <h2>
                  <ShieldCheck size={17} /> UPI case report
                </h2>
                <p>PDF export for the selected UPI case</p>
              </div>
              <small className="tag">.pdf</small>
            </div>
            <p className="emotion-note">
              Each UPI case exports its own PDF from the UPI investigation
              section, including the rule-based analysis and limitations.
            </p>
            <button
              className="secondary full"
              onClick={() => navigateTo("UPI Fraud Investigation", "upi")}
            >
              Go to UPI investigation
            </button>
          </section>
        </div>

        {/* ---------- EVIDENCE INTEGRITY ---------- */}
        <section className="sectionhead" id="integrity">
          <div>
            <small className="eyebrow">Evidence integrity</small>
            <h2>File integrity and checklist</h2>
            <p>
              A hash supports file comparison. It does not prove authenticity or
              chain of custody.
            </p>
          </div>
        </section>

        <div className="twocol">
          <section className="panel">
            <div className="panelhead">
              <div>
                <h2>
                  <Fingerprint size={17} /> Evidence integrity
                </h2>
                <p>SHA-256 of the selected audio file</p>
              </div>
              <small className="tag">File hash</small>
            </div>
            <dl className="facts">
              <div>
                <dt>Original filename</dt>
                <dd>{file ? file.name : "Not available in this session"}</dd>
              </div>
              <div>
                <dt>File size</dt>
                <dd>
                  {file ? `${(file.size / 1048576).toFixed(2)} MB` : "N/A"}
                </dd>
              </div>
              <div>
                <dt>Media type</dt>
                <dd>{file ? file.type || "Unknown" : "N/A"}</dd>
              </div>
              <div>
                <dt>Last modified (file)</dt>
                <dd>
                  {file?.lastModified
                    ? new Date(file.lastModified).toLocaleString()
                    : "N/A"}
                </dd>
              </div>
              <div>
                <dt>Hash status</dt>
                <dd>{hashStatus}</dd>
              </div>
              <div>
                <dt>Processing status</dt>
                <dd>{audioStatus}</dd>
              </div>
              <div>
                <dt>Checklist</dt>
                <dd>
                  {collectedCount} of {evidence.length} collected
                </dd>
              </div>
              <div>
                <dt>Chain of custody</dt>
                <dd>No custody workflow implemented</dd>
              </div>
            </dl>
            <div className="hash-value">
              {audioHash || "Upload an audio file to calculate its hash."}
            </div>
            <div className="hashactions">
              <button
                className="secondary small"
                onClick={copyHash}
                disabled={!audioHash}
              >
                Copy hash
              </button>
            </div>
            <p className="emotion-note">
              Keep the original file unchanged. A matching hash helps compare
              file bytes; it does not prove the recording's origin or earlier
              chain of custody.
            </p>
          </section>

          <section className="panel">
            <div className="panelhead">
              <div>
                <h2>
                  <ClipboardCheck size={17} /> Evidence checklist
                </h2>
                <p>Update each item's review status</p>
              </div>
              <small className="tag">
                {collectedCount}/{evidence.length}
              </small>
            </div>
            <div className="evidence-list">
              {evidence.map((item) => (
                <div className="evidence-item" key={item.id}>
                  <span>{item.name}</span>
                  <select
                    value={item.status}
                    data-status={item.status}
                    onChange={(e) => updateEvidence(item.id, e.target.value)}
                    aria-label={`Status for ${item.name}`}
                  >
                    <option value="pending">Pending</option>
                    <option value="collected">Collected</option>
                    <option value="unavailable">Unavailable</option>
                  </select>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* ---------- TIMELINE ---------- */}
        <section className="sectionhead" id="timeline">
          <div>
            <small className="eyebrow">Investigation timeline</small>
            <h2>What happened, in order</h2>
            <p>
              Events are recorded as they occur in this browser. Nothing is
              back-filled.
            </p>
          </div>
        </section>

        <section className="panel">
          <div className="panelhead">
            <div>
              <h2>
                <Clock3 size={17} /> Incident timeline
              </h2>
              <p>Uploaded, analyzed and manually entered events</p>
            </div>
            <button className="secondary small" onClick={addEvent}>
              <Plus size={12} /> Add event
            </button>
          </div>
          <div className="event-list">
            {timelineItems.map((e) => (
              <div className="event-item" key={e.id}>
                <div>
                  <b>{e.label}</b> <span className="srcpill">{e.source}</span>
                  <time>{fmtDate(e.time)}</time>
                  {e.detail && <p>{e.detail}</p>}
                </div>
                {!e.readonly && (
                  <button
                    className="iconbtn"
                    onClick={() => removeEvent(e.id)}
                    title="Remove event"
                    aria-label="Remove event"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
            {!timelineItems.length && (
              <p className="empty">Events will appear here as you work.</p>
            )}
          </div>
        </section>

        <footer className="pagefoot">
          CyberMitra <b>Prototype</b>
          <span>AI results require independent human verification</span>
        </footer>
      </main>

      {toast && (
        <div
          className={`toast toast-${toastTone}`}
          role={toastTone === "error" ? "alert" : "status"}
        >
          {toast}
        </div>
      )}
    </div>
  );
}

const isCallerPage = window.location.pathname.replace(/\/+$/, "") === "/caller";
createRoot(document.getElementById("root")).render(
  isCallerPage ? <CallerPage LiveCall={LiveCall} /> : <App />,
);
