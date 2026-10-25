const DATABASE_NAME = "cybermitra-audio-evidence-v1";
const STORE_NAME = "recordings";

function openAudioEvidenceDatabase() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error("This browser does not support persistent audio evidence storage."));
      return;
    }

    const request = window.indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME, { keyPath: "caseId" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Could not open audio evidence storage."));
  });
}

export async function saveAudioEvidence(caseId, file) {
  const database = await openAudioEvidenceDatabase();
  await new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put({ caseId, file });
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error || new Error("Could not save the live-call WAV."));
    transaction.onabort = () => reject(transaction.error || new Error("Live-call WAV storage was interrupted."));
  }).finally(() => database.close());
}

export async function loadAudioEvidence(caseId) {
  const database = await openAudioEvidenceDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).get(caseId);
    request.onsuccess = () => resolve(request.result?.file || null);
    request.onerror = () => reject(request.error || new Error("Could not load the saved live-call WAV."));
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => {
      database.close();
      reject(transaction.error || new Error("Could not read saved audio evidence."));
    };
  });
}

export async function deleteAudioEvidence(caseId) {
  const database = await openAudioEvidenceDatabase();
  await new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(caseId);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error || new Error("Could not remove orphaned audio evidence."));
    transaction.onabort = () => reject(transaction.error || new Error("Audio evidence cleanup was interrupted."));
  }).finally(() => database.close());
}
