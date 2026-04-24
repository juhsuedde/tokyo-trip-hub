const path = require('path');
const fs = require('fs');
const { logger } = require('./logger');

const STORAGE_TYPE = process.env.STORAGE_TYPE || 'local';
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '..', '..', 'uploads');
const BASE_URL = process.env.BASE_URL || 'http://localhost:3001';

let s3Client = null;
let s3Bucket = null;

async function getS3Client() {
  if (!s3Client && STORAGE_TYPE === 's3') {
    const { S3Client } = require('@aws-sdk/client-s3');
    s3Client = new S3Client({
      region: process.env.AWS_REGION || 'us-east-1',
      credentials: process.env.AWS_ACCESS_KEY_ID ? {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      } : undefined,
    });
    s3Bucket = process.env.AWS_S3_BUCKET;
  }
  return s3Client;
}

async function uploadToS3(file, key, contentType) {
  const { Upload } = require('@aws-sdk/lib-storage');
  const client = await getS3Client();
  const upload = new Upload({
    client,
    params: {
      Bucket: s3Bucket,
      Key: key,
      Body: fs.createReadStream(file.tempFilePath),
      ContentType: contentType,
    },
  });
  await upload.done();
  return `https://${s3Bucket}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${key}`;
}

let cloudinary = null;

async function getCloudinary() {
  if (!cloudinary && STORAGE_TYPE === 'cloudinary') {
    const { v2: cloudinarySdk } = require('cloudinary');
    cloudinary = cloudinarySdk.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });
    cloudinarySdk.uploader;
  }
  return cloudinary;
}

async function uploadToCloudinary(file, folder) {
  const { v2: cloudinarySdk } = require('cloudinary');
  cloudinarySdk.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
  
  const result = await cloudinarySdk.uploader.upload(file.tempFilePath, {
    folder: folder || 'tokyotrip',
    resource_type: 'auto',
  });
  
  return result.secure_url;
}

async function saveFile(file, type) {
  const ext = path.extname(file.name).toLowerCase();
  const filename = `${type.toLowerCase()}_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`;
  
  if (STORAGE_TYPE === 's3') {
    const mimeTypes = {
      PHOTO: 'image/jpeg',
      VIDEO: 'video/mp4',
      VOICE: 'audio/mpeg',
    };
    const contentType = mimeTypes[type] || 'application/octet-stream';
    const key = `uploads/${filename}`;
    const url = await uploadToS3(file, key, contentType);
    logger.info({ filename, type, storage: 's3' }, 'File uploaded to S3');
    return url;
  }

  if (STORAGE_TYPE === 'cloudinary') {
    const url = await uploadToCloudinary(file, 'tokyotrip/uploads');
    logger.info({ filename, type, storage: 'cloudinary' }, 'File uploaded to Cloudinary');
    return url;
  }

  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
  
  const destPath = path.join(UPLOAD_DIR, filename);
  fs.copyFileSync(file.tempFilePath, destPath);
  logger.info({ filename, type, storage: 'local' }, 'File saved locally');
  return `/uploads/${filename}`;
}

async function deleteFile(url) {
  if (!url) return;
  
  if (STORAGE_TYPE === 's3' && url.includes('amazonaws.com')) {
    const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
    const client = await getS3Client();
    const key = url.split('.s3.')[1]?.split('/').slice(1).join('/');
    if (key) {
      await client.send(new DeleteObjectCommand({ Bucket: s3Bucket, Key: key }));
      logger.info({ key }, 'File deleted from S3');
    }
    return;
  }

  if (STORAGE_TYPE === 'cloudinary' && url.includes('cloudinary.com')) {
    const { v2: cloudinarySdk } = require('cloudinary');
    cloudinarySdk.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });
    const publicId = url.split('/upload/')[1]?.replace(/\.[^.]+$/, '');
    if (publicId) {
      await cloudinarySdk.uploader.destroy(publicId);
      logger.info({ publicId }, 'File deleted from Cloudinary');
    }
    return;
  }

  const localPath = url.replace('/uploads/', '');
  const fullPath = path.join(UPLOAD_DIR, localPath);
  if (fs.existsSync(fullPath)) {
    fs.unlinkSync(fullPath);
    logger.info({ path: fullPath }, 'File deleted locally');
  }
}

module.exports = { saveFile, deleteFile, STORAGE_TYPE };