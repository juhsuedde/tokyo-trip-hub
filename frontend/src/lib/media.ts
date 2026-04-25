import imageCompression from 'browser-image-compression';

/**
 * Compress an image file client-side before upload.
 * Target: max 1200px wide, ~80% quality, max 1MB.
 */
export async function compressImage(file) {
  const options = {
    maxSizeMB: 1,
    maxWidthOrHeight: 1200,
    useWebWorker: true,
    fileType: 'image/webp',
    initialQuality: 0.8,
  };
  try {
    const compressed = await imageCompression(file, options);
    return compressed;
  } catch (err) {
    console.warn('[compress] falling back to original:', err.message);
    return file;
  }
}

/**
 * Build a FormData payload for a media entry upload.
 */
export function buildEntryFormData({ type, rawText, file, latitude, longitude, address, capturedAt }) {
  const fd = new FormData();
  fd.append('type', type);
  if (rawText) fd.append('rawText', rawText);
  if (file) fd.append('file', file);
  if (latitude != null) fd.append('latitude', String(latitude));
  if (longitude != null) fd.append('longitude', String(longitude));
  if (address) fd.append('address', address);
  if (capturedAt) fd.append('capturedAt', capturedAt);
  return fd;
}

/**
 * Get current geolocation as a Promise.
 */
export function getLocation(timeout = 8000) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      () => resolve(null), // silently fail — location is optional
      { timeout, enableHighAccuracy: false }
    );
  });
}
