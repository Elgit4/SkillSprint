const DB_NAME = 'skillsprint-offline';
const DB_VERSION = 1;
const CATALOGUE_STORE = 'catalogues';
const QUEUE_STORE = 'sync_queue';

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Offline storage request failed.'));
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onabort = () => reject(transaction.error || new Error('Offline storage transaction aborted.'));
    transaction.onerror = () => reject(transaction.error || new Error('Offline storage transaction failed.'));
  });
}

export function openOfflineDatabase(indexedDBApi = globalThis.indexedDB) {
  if (!indexedDBApi) return Promise.reject(new Error('This browser does not provide IndexedDB.'));
  return new Promise((resolve, reject) => {
    const request = indexedDBApi.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(CATALOGUE_STORE)) db.createObjectStore(CATALOGUE_STORE, { keyPath: 'userId' });
      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        const queue = db.createObjectStore(QUEUE_STORE, { keyPath: 'id' });
        queue.createIndex('byUser', 'userId', { unique: false });
        queue.createIndex('byUserCreated', ['userId', 'createdAt'], { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open offline storage.'));
    request.onblocked = () => reject(new Error('Offline storage is busy in another SkillSprint tab. Close the other tab and retry.'));
  });
}

export async function saveOfflineSnapshot(userId, snapshot) {
  if (!userId || !snapshot || !Array.isArray(snapshot.lessons) || !Array.isArray(snapshot.paths)) {
    throw new TypeError('A user ID and complete learning catalogue are required.');
  }
  const db = await openOfflineDatabase();
  const transaction = db.transaction(CATALOGUE_STORE, 'readwrite');
  transaction.objectStore(CATALOGUE_STORE).put({ userId, ...snapshot, cachedAt: new Date().toISOString() });
  await transactionDone(transaction);
  db.close();
}

export async function loadOfflineSnapshot(userId) {
  if (!userId) return null;
  const db = await openOfflineDatabase();
  const transaction = db.transaction(CATALOGUE_STORE, 'readonly');
  const result = await requestResult(transaction.objectStore(CATALOGUE_STORE).get(userId));
  await transactionDone(transaction);
  db.close();
  return result || null;
}

export async function enqueueOfflineAction(userId, action) {
  if (!userId || !['answer', 'skip'].includes(action?.type) || !action.lessonId) {
    throw new TypeError('A user ID and valid lesson action are required.');
  }
  const id = globalThis.crypto?.randomUUID?.() || `offline-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const item = {
    id,
    userId,
    type: action.type,
    lessonId: action.lessonId,
    answer: action.type === 'answer' ? String(action.answer ?? '') : null,
    durationSeconds: Math.max(0, Math.min(7200, Number(action.durationSeconds) || 0)),
    createdAt: new Date().toISOString(),
  };
  const db = await openOfflineDatabase();
  const transaction = db.transaction(QUEUE_STORE, 'readwrite');
  transaction.objectStore(QUEUE_STORE).add(item);
  await transactionDone(transaction);
  db.close();
  return item;
}

export async function listOfflineActions(userId) {
  if (!userId) return [];
  const db = await openOfflineDatabase();
  const transaction = db.transaction(QUEUE_STORE, 'readonly');
  const request = transaction.objectStore(QUEUE_STORE).index('byUser').getAll(userId);
  const rows = await requestResult(request);
  await transactionDone(transaction);
  db.close();
  return (rows || []).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function removeOfflineAction(id) {
  if (!id) return;
  const db = await openOfflineDatabase();
  const transaction = db.transaction(QUEUE_STORE, 'readwrite');
  transaction.objectStore(QUEUE_STORE).delete(id);
  await transactionDone(transaction);
  db.close();
}

export async function countOfflineActions(userId) {
  return (await listOfflineActions(userId)).length;
}
