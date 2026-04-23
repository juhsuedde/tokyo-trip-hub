// backend/src/lib/upload.js
// Currently uses local disk (multer).
// To switch to S3: replace storage with multer-s3 and set AWS_* env vars.
// To switch to Cloudinary: use multer-storage-cloudinary.

import multer from 'multer';
import path from 'path';
import { randomUUID } from 'crypto';
import fs from 'fs';

const UPLOAD_DIR = process.env.UPLOAD_DIR ?? './uploads';

// Ensure directories exist
for (const sub of ['media', 'avatars']) {
  fs.mkdirSync(path.join(UPLOAD_DIR, sub), { recursive: true });
}

function diskStorage(subdir) {
  return multer.diskStorage({
    destination: path.join(UPLOAD_DIR, subdir),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${randomUUID()}${ext}`);
    },
  });
}

export const uploadMedia = multer({
  storage: diskStorage('media'),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'audio/webm', 'audio/mp4', 'audio/mpeg'];
    cb(null, allowed.includes(file.mimetype));
  },
});

export const uploadAvatar = multer({
  storage: diskStorage('avatars'),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    cb(null, allowed.includes(file.mimetype));
  },
});
