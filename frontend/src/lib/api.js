/**
 * frontend/src/lib/api.js  (Phase 3 — adds export endpoints)
 */
import { saveOfflineEntry, syncOfflineEntries } from './offlineQueue';

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

async function requestWithOfflineFallback(tripId, formDataOrBody, isFormData) {
  try {
    return await request('POST', `/entries/trips/${tripId}/entries`, formDataOrBody, isFormData);
  } catch (err) {
    if (isNetworkError(err)) {
      if (isFormData) {
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

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => syncOfflineEntries());
}

export { syncOfflineEntries };

export const api = {
  register:        (name) => request('POST', '/users/register', { name }),
  me:              () => request('GET', '/users/me'),
  createTrip:      (data) => request('POST', '/trips', data),
  joinTrip:        (code) => request('POST', `/trips/${code}/join`),
  getTrip:         (id) => request('GET', `/trips/${id}`),
  getFeed:         (tripId, cursor) =>
    request('GET', `/trips/${tripId}/feed${cursor ? `?cursor=${cursor}` : ''}`),
  getMembers:      (tripId) => request('GET', `/trips/${tripId}/members`),
  createEntry:     (tripId, formData) => requestWithOfflineFallback(tripId, formData, true),
  createTextEntry: (tripId, data) => requestWithOfflineFallback(tripId, data, false),
  deleteEntry:     (id) => request('DELETE', `/entries/${id}`),
  toggleReaction:  (entryId, emoji) => request('POST', `/entries/${entryId}/reactions`, { emoji }),
  addComment:      (entryId, text) => request('POST', `/entries/${entryId}/comments`, { text }),
  getEntryStatus:  (id) => request('GET', `/entries/${id}/status`),

  // ── Export ──────────────────────────────────────────────────────────────────
  startExport: (tripId, { format, template, entryIds }) =>
    request('POST', `/trips/${tripId}/export`, { format, template, entryIds }),
  getExportStatus: (jobId) =>
    request('GET', `/export/${jobId}/status`),
  // Download URL is a direct link: /api/export/:jobId/download
  getExportDownloadUrl: (jobId) => `/api/export/${jobId}/download`,
};