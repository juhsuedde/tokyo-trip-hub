// frontend/src/lib/api.js  (Phase 4 — replace existing)
// Wraps fetch with:
//   - Auto JWT injection from localStorage
//   - JSON parsing + error normalization
//   - Multipart support for file uploads

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';
const TOKEN_KEY = 'tokyohub_token';

async function request(method, path, body, isFormData = false) {
  const token = localStorage.getItem(TOKEN_KEY);

  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (!isFormData) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers,
    body: isFormData ? body : body !== undefined ? JSON.stringify(body) : undefined,
  });

  let data;
  const contentType = res.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    data = await res.json();
  } else {
    data = await res.text();
  }

  if (!res.ok) {
    const message = data?.error ?? data ?? `HTTP ${res.status}`;
    const err = new Error(message);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body),
  put: (path, body) => request('PUT', path, body),
  patch: (path, body) => request('PATCH', path, body),
  delete: (path) => request('DELETE', path),
  // For file uploads (FormData)
  upload: (path, formData) => request('POST', path, formData, true),
  uploadPut: (path, formData) => request('PUT', path, formData, true),
};
