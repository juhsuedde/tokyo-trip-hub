import { saveOfflineEntry, syncOfflineEntries } from './offlineQueue';

// Keep BASE empty to use relative URLs that go through Vite proxy
const BASE = '';

function getSession() {
  return localStorage.getItem('sessionToken');
}

function isNetworkError(err) {
  return (
    err instanceof TypeError &&
    (err.message === 'Failed to fetch' || err.message.includes('NetworkError'))
  );
}

async function request(method, path, body, isFormData = false) {
  const token = getSession();
  const headers = {};
  if (token) headers['X-Session-Token'] = token;
  if (!isFormData) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers,
    body: isFormData ? body : body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

/**
 * Like request(), but falls back to IndexedDB on network failure.
 * Only used for entry creation (POST).
 */
async function requestWithOfflineFallback(tripId, formDataOrBody, isFormData) {
  try {
    return await request('POST', `/entries/trips/${tripId}/entries`, formDataOrBody, isFormData);
  } catch (err) {
    if (isNetworkError(err)) {
      if (isFormData) {
        // Extract file blob for later re-upload
        const file = formDataOrBody.get('file');
        const data = {};
        for (const [k, v] of formDataOrBody.entries()) {
          if (k !== 'file') data[k] = v;
        }
        await saveOfflineEntry({
          tripId,
          data,
          fileBlob: file ? await file.arrayBuffer().then((b) => new Blob([b], { type: file.type })) : null,
          fileName: file?.name,
          fileType: file?.type,
        });
      } else {
        await saveOfflineEntry({ tripId, data: formDataOrBody });
      }
      return { offline: true };
    }
    throw err;
  }
}

// Auto-sync when the browser comes back online
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    syncOfflineEntries();
  });
}

export { syncOfflineEntries };

export const api = {
  register: (name) => request('POST', '/users/register', { name }),
  me: () => request('GET', '/users/me'),
  createTrip: (data) => request('POST', '/trips', data),
  joinTrip: (code) => request('POST', `/trips/${code}/join`),
  getTrip: (id) => request('GET', `/trips/${id}`),
  getFeed: (tripId, cursor) =>
    request('GET', `/trips/${tripId}/feed${cursor ? `?cursor=${cursor}` : ''}`),
  getMembers: (tripId) => request('GET', `/trips/${tripId}/members`),

  // Updated: offline-aware entry creation
  createEntry: (tripId, formData) =>
    requestWithOfflineFallback(tripId, formData, true),
  createTextEntry: (tripId, data) =>
    requestWithOfflineFallback(tripId, data, false),

  deleteEntry: (id) => request('DELETE', `/entries/${id}`),
  toggleReaction: (entryId, emoji) =>
    request('POST', `/entries/${entryId}/reactions`, { emoji }),
  addComment: (entryId, text) =>
    request('POST', `/entries/${entryId}/comments`, { text }),
  getEntryStatus: (id) => request('GET', `/entries/${id}/status`),
};