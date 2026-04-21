const BASE = import.meta.env.VITE_API_URL || '';

function getSession() {
  return localStorage.getItem('sessionToken');
}

async function request(method, path, body, isFormData = false) {
  const token = getSession();
  const headers = {};
  if (token) headers['X-Session-Token'] = token;
  if (!isFormData) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers,
    body: isFormData ? body : (body ? JSON.stringify(body) : undefined),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

export const api = {
  // Users
  register: (name) => request('POST', '/users/register', { name }),
  me: () => request('GET', '/users/me'),

  // Trips
  createTrip: (data) => request('POST', '/trips', data),
  joinTrip: (code) => request('POST', `/trips/${code}/join`),
  getTrip: (id) => request('GET', `/trips/${id}`),
  getFeed: (tripId, cursor) =>
    request('GET', `/trips/${tripId}/feed${cursor ? `?cursor=${cursor}` : ''}`),
  getMembers: (tripId) => request('GET', `/trips/${tripId}/members`),

  // Entries
  createEntry: (tripId, formData) =>
    request('POST', `/entries/trips/${tripId}/entries`, formData, true),
  createTextEntry: (tripId, data) =>
    request('POST', `/entries/trips/${tripId}/entries`, data),
  deleteEntry: (id) => request('DELETE', `/entries/${id}`),

  // Reactions
  toggleReaction: (entryId, emoji) =>
    request('POST', `/entries/${entryId}/reactions`, { emoji }),

  // Comments
  addComment: (entryId, text) =>
    request('POST', `/entries/${entryId}/comments`, { text }),
};
