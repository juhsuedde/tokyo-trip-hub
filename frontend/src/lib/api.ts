/**
 * frontend/src/lib/api.ts  (Phase 3 — adds export endpoints)
 */
import { saveOfflineEntry, syncOfflineEntries } from './offlineQueue';

const BASE = '';

function getSession() {
  return localStorage.getItem('sessionToken');
}

function isNetworkError(err: unknown): boolean {
  return (
    err instanceof TypeError &&
    (err.message === 'Failed to fetch' || err.message.includes('NetworkError'))
  );
}

async function request(method: string, path: string, body: unknown, isFormData = false) {
  const token = getSession();
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (!isFormData) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers,
    body: isFormData ? body as BodyInit : body ? JSON.stringify(body) : undefined,
  });
   
  const text = await res.text();
  if (res.status === 401) {
    localStorage.removeItem('sessionToken');
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }
  if (!res.ok) {
    const data = text ? JSON.parse(text) : {};
    throw new Error(data.error || `HTTP ${res.status}`);
  }
   
  return text ? JSON.parse(text) : {};
}

async function requestWithOfflineFallback(tripId: string, formDataOrBody: unknown, isFormData: boolean) {
  try {
    return await request('POST', `/entries/trips/${tripId}/entries`, formDataOrBody, isFormData);
  } catch (err) {
    if (isNetworkError(err)) {
      if (isFormData && formDataOrBody instanceof FormData) {
        const file = formDataOrBody.get('file');
        const data: Record<string, unknown> = {};
        for (const [k, v] of formDataOrBody.entries()) {
          if (k !== 'file') data[k] = v;
        }
        await saveOfflineEntry({
          tripId,
          data,
          fileBlob: file ? await (file as Blob).arrayBuffer().then((b) => new Blob([b], { type: (file as Blob).type })) : null,
          fileName: (file as File)?.name,
          fileType: (file as File)?.type,
        });
      } else {
        await saveOfflineEntry({ tripId, data: formDataOrBody as Record<string, unknown> });
      }
      return { offline: true };
    }
    throw err;
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => syncOfflineEntries());
}

export { syncOfflineEntries, request };

export const api = {
  // Auth
  login: (email, password) => request('POST', '/auth/login', { email, password }),
  register: (email, password, name) => request('POST', '/auth/register', { email, password, name }),
  upgrade: (tier) => request('POST', '/auth/upgrade', { tier }),
  me: async () => {
    const res = await request('GET', '/auth/me');
    return res.user || res;
  },

  // Trips
  getTrips: () => request('GET', '/trips'),
  createTrip: (data) => request('POST', '/trips', data),
  joinTrip: (code) => request('POST', `/trips/${code}/join`),
  getTrip: (id) => request('GET', `/trips/${id}`),
  getTripMembers: (id) => request('GET', `/trips/${id}/members`),
  deleteTrip: (id) => request('DELETE', `/trips/${id}`),
  leaveTrip: (id) => request('DELETE', `/trips/${id}/leave`),
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
    request('POST', `/export/trips/${tripId}/export`, { format, template, entryIds }),
  getExportStatus: (jobId) =>
    request('GET', `/export/${jobId}/status`),
  // Download URL is a direct link: /api/export/:jobId/download
  getExportDownloadUrl: (jobId) => `/api/export/${jobId}/download`,
};