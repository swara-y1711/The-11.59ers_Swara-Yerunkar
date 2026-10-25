export const PRIORITY_CASES_KEY = "cybermitra-priority-cases-v1";
export const CASE_STORE_UPDATED_EVENT = "cybermitra-case-store-updated";

export function persistCaseRecord(record, sourceStorage) {
  const previousPriorityCases = localStorage.getItem(PRIORITY_CASES_KEY);
  const previousSource = sourceStorage
    ? localStorage.getItem(sourceStorage.key)
    : null;

  try {
    const storedCases = previousPriorityCases
      ? JSON.parse(previousPriorityCases)
      : [];
    if (!Array.isArray(storedCases)) {
      throw new Error("The saved case list is not valid.");
    }

    const existingRecord = storedCases.find(item => item.id === record.id);
    const updatedRecord = existingRecord
      ? {
          ...existingRecord,
          ...record,
          status: existingRecord.status || record.status,
          officer: existingRecord.officer || record.officer,
          followUpDue: existingRecord.followUpDue === undefined
            ? record.followUpDue
            : existingRecord.followUpDue,
          timeline: existingRecord.timeline?.length
            ? existingRecord.timeline
            : record.timeline,
          notes: existingRecord.notes || record.notes,
          priorityOverride: existingRecord.priorityOverride === undefined
            ? record.priorityOverride
            : existingRecord.priorityOverride
        }
      : record;
    const updatedCases = [
      updatedRecord,
      ...storedCases.filter(item => item.id !== record.id)
    ];
    localStorage.setItem(PRIORITY_CASES_KEY, JSON.stringify(updatedCases));
    if (sourceStorage) {
      localStorage.setItem(sourceStorage.key, sourceStorage.value);
    }
  } catch (error) {
    try {
      if (previousPriorityCases === null) {
        localStorage.removeItem(PRIORITY_CASES_KEY);
      } else {
        localStorage.setItem(PRIORITY_CASES_KEY, previousPriorityCases);
      }
      if (sourceStorage) {
        if (previousSource === null) {
          localStorage.removeItem(sourceStorage.key);
        } else {
          localStorage.setItem(sourceStorage.key, previousSource);
        }
      }
    } catch (rollbackError) {
      throw new Error(
        `Case save failed and storage rollback also failed: ${rollbackError.message}`,
        { cause: error }
      );
    }
    throw new Error(`Unable to save the registered case: ${error.message}`, {
      cause: error
    });
  }

  window.dispatchEvent(new Event(CASE_STORE_UPDATED_EVENT));
}
