import imageCompression from 'browser-image-compression';

interface Coordinates {
  latitude: number;
  longitude: number;
}

/**
 * Compress an image file client-side before upload.
 * Target: max 1200px wide, ~80% quality, max 1MB.
 */
export async function compressImage(file: File): Promise<File> {
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
export function buildEntryFormData(params: { 
  type: string; 
  rawText?: string; 
  file?: File; 
  latitude?: number | null; 
  longitude?: number | null; 
  address?: string; 
  capturedAt?: string
}) {
  const fd = new FormData();
  fd.append('type', params.type);
  if (params.rawText) fd.append('rawText', params.rawText);
  if (params.file) fd.append('file', params.file);
  if (params.latitude != null) fd.append('latitude', String(params.latitude));
  if (params.longitude != null) fd.append('longitude', String(params.longitude));
  if (params.address) fd.append('address', params.address);
  if (params.capturedAt) fd.append('capturedAt', params.capturedAt);
  return fd;
}

/**
 * Get current geolocation as a Promise.
 */
export function getLocation(timeout = 8000): Promise<Coordinates | null> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      () => resolve(null), // silently fail — location is optional
      { timeout, enableHighAccuracy: false }
    );
  });
}
