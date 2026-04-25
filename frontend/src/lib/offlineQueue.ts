const DB_NAME = 'tokyotrip-offline';
const DB_VERSION = 1;
const STORE_NAME = 'pending-entries';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Save an entry to IndexedDB when the network is unavailable.
 * @param {Object} payload - { tripId, data, isFormData, fileBlob?, fileName?, fileType? }
 */
export async function saveOfflineEntry(payload) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.add({ ...payload, savedAt: Date.now() });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Read all pending entries from IndexedDB.
 */
async function getAllPending() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Delete a pending entry by its IDB id.
 */
async function deletePending(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/**
 * Register for Background Sync API to automatically sync when online.
 * Call this on app initialization.
 */
export async function registerBackgroundSync() {
  if ('serviceWorker' in navigator && 'SyncManager' in window) {
    try {
      const registration = await navigator.serviceWorker.ready;
      await registration.sync.register('sync-pending-entries');
      console.log('[offline] Background Sync registered');
    } catch (err) {
      console.warn('[offline] Background Sync not available:', err.message);
    }
  }
}

/**
 * Returns the number of items waiting to be synced.
 */
export async function getPendingCount() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Attempt to sync all pending entries to the server.
 * Removes successfully synced items from the queue.
 */
export async function syncOfflineEntries() {
  const BASE = import.meta.env.VITE_API_URL || '';
  const token = localStorage.getItem('sessionToken');

  const items = await getAllPending();
  if (items.length === 0) return;

  for (const item of items) {
    try {
      let body;
      let headers = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      if (item.fileBlob) {
        // Reconstruct FormData for photo/voice entries
        const fd = new FormData();
        const file = new File([item.fileBlob], item.fileName || 'upload', {
          type: item.fileType || 'application/octet-stream',
        });
        fd.append('file', file);
        if (item.data) {
          Object.entries(item.data).forEach(([k, v]) => {
            if (v !== undefined && v !== null) fd.append(k, v);
          });
        }
        body = fd;
      } else {
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify(item.data);
      }

      const res = await fetch(`${BASE}/api/entries/trips/${item.tripId}/entries`, {
        method: 'POST',
        headers,
        body,
      });

      if (res.ok) {
        await deletePending(item.id);
      }
    } catch {
      // Leave in queue; will retry on next online event
    }
  }
}