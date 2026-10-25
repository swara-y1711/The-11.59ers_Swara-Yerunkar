const FACT_KEYS = [
  "safetyConcern",
  "timeSensitiveFraud",
  "ongoingActivity",
  "affectedVictims",
  "evidenceUrgency",
  "pendingAction"
];

const NEXT_ACTIONS = {
  safetyConcern: "Arrange an immediate safety check and escalate for urgent human review.",
  timeSensitiveFraud: "Contact the bank or payment provider through its official channel and record the response reference.",
  ongoingActivity: "Interrupt or report the continuing activity through the relevant platform or service provider.",
  affectedVictims: "Check for linked reports and coordinate victim-safe outreach.",
  evidenceUrgency: "Preserve the original evidence and request time-sensitive retention from the relevant provider.",
  pendingAction: "Complete the overdue follow-up and document its outcome."
};

export function assessCasePriority(caseRecord, now = Date.now()) {
  const factors = caseRecord.priorityFactors || {};
  const missing = FACT_KEYS.filter(key => factors[key] === undefined || factors[key] === null);
  const reasons = [];
  const actions = [];
  let score = 0;

  if (factors.safetyConcern === true) {
    reasons.push("Immediate safety concern reported; urgent human review is required.");
    actions.push(NEXT_ACTIONS.safetyConcern);
  }
  if (factors.timeSensitiveFraud === true) {
    score += 4;
    reasons.push("A time-sensitive financial response may still reduce further harm.");
    actions.push(NEXT_ACTIONS.timeSensitiveFraud);
  }
  if (factors.ongoingActivity === true) {
    score += 4;
    reasons.push("Threatening or fraudulent activity may still be continuing.");
    actions.push(NEXT_ACTIONS.ongoingActivity);
  }
  if (Number(factors.affectedVictims) >= 10) {
    score += 5;
    reasons.push("Ten or more potentially affected victims are indicated.");
    actions.push(NEXT_ACTIONS.affectedVictims);
  } else if (Number(factors.affectedVictims) >= 4) {
    score += 3;
    reasons.push("Several potentially affected victims are indicated.");
    actions.push(NEXT_ACTIONS.affectedVictims);
  } else if (Number(factors.affectedVictims) >= 2) {
    score += 2;
    reasons.push("More than one potentially affected victim is indicated.");
    actions.push(NEXT_ACTIONS.affectedVictims);
  }
  if (factors.evidenceUrgency === true) {
    score += 4;
    reasons.push("Relevant evidence may be at risk of loss or automatic deletion.");
    actions.push(NEXT_ACTIONS.evidenceUrgency);
  }

  const followUpDue = caseRecord.followUpDue ? new Date(caseRecord.followUpDue).getTime() : NaN;
  const followUpOverdue = caseRecord.status !== "Closed" && Number.isFinite(followUpDue) && followUpDue < now;
  const hasPendingAction = caseRecord.status !== "Closed" && factors.pendingAction === true;
  if (hasPendingAction || followUpOverdue) {
    score += followUpOverdue ? 3 : 2;
    reasons.push(followUpOverdue
      ? "A follow-up deadline has passed."
      : "An investigator action or follow-up is pending.");
    actions.push(NEXT_ACTIONS.pendingAction);
  }

  if (missing.length) {
    reasons.push(`Priority information is incomplete (${missing.map(key => key.replace(/[A-Z]/g, letter => ` ${letter.toLowerCase()}`)).join(", ")}); do not treat missing details as low risk.`);
  }

  let level = "Low";
  if (factors.safetyConcern === true || score >= 8) {
    level = "Critical";
  } else if (score >= 4) {
    level = "High";
  } else if (score > 0 || missing.length) {
    level = "Medium";
  }

  if (!reasons.length) {
    reasons.push(missing.length
      ? "There are no confirmed risk indicators yet; incomplete information requires human review."
      : "No listed urgency indicators are currently recorded. Continue routine review; this is not a finding about case validity.");
  }
  if (!actions.length) {
    actions.push(missing.length
      ? "Verify missing safety, activity, victim-count, evidence and follow-up information with the reporting record."
      : "Review the available evidence and record any follow-up deadline.");
  }
  if (factors.safetyConcern === true) {
    reasons.push("This assessment is a triage aid and must not replace immediate human safety review.");
  }

  return {
    level,
    reasons,
    nextAction: [...new Set(actions)].join(" "),
    urgentHumanReview: factors.safetyConcern === true,
    score
  };
}

export function getEffectivePriority(caseRecord) {
  return caseRecord.priorityOverride?.level || assessCasePriority(caseRecord).level;
}
