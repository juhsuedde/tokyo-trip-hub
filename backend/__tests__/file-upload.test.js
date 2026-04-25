const request = require('supertest');
const { createApp } = require('../src/app');
const { prisma } = require('../src/lib/prisma');
const bcrypt = require('bcrypt');
const path = require('path');
const fs = require('fs');

let app;
let user, accessToken;
let tripId;

const TEST_EMAIL = 'file-upload@test.com';

beforeAll(async () => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-for-integration-tests';
  process.env.NODE_ENV = 'test';

  await prisma.user.deleteMany({ where: { email: TEST_EMAIL } });

  user = await prisma.user.create({
    data: { name: 'Upload Test', email: TEST_EMAIL, passwordHash: await bcrypt.hash('password123', 4) },
  });

  const trip = await prisma.trip.create({
    data: {
      title: 'Upload Test Trip',
      destination: 'Tokyo, Japan',
      inviteCode: 'UPLOAD1',
      ownerId: user.id,
      memberships: { create: { userId: user.id, role: 'OWNER' } },
    },
  });
  tripId = trip.id;

  app = createApp();

  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: TEST_EMAIL, password: 'password123' })
    .expect(200);
  accessToken = res.body.accessToken;
});

afterAll(async () => {
  await prisma.trip.deleteMany({ where: { ownerId: user.id } });
  await prisma.user.deleteMany({ where: { email: TEST_EMAIL } });
  await prisma.$disconnect();
});

function auth() {
  return { Authorization: `Bearer ${accessToken}` };
}

const tmpDir = path.join(__dirname, '..', 'tmp');

function makeTempFile(name, content) {
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const filePath = path.join(tmpDir, `test_${Date.now()}_${Math.random().toString(36).slice(2)}_${name}`);
  fs.writeFileSync(filePath, content);
  return filePath;
}

function cleanup(filePath) {
  try { if (filePath) fs.unlinkSync(filePath); } catch {}
}

// Minimal valid JPEG (1x1 pixel white)
const JPEG_BYTES = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AVIP/2Q==',
  'base64'
);

// Minimal valid PNG (1x1 white pixel)
const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
  'base64'
);

describe('File Upload Validation', () => {
  describe('Rejected file types by extension', () => {
    test('rejects .exe file as PHOTO', async () => {
      const filePath = makeTempFile('malware.exe', Buffer.alloc(100, 0));
      try {
        const res = await request(app)
          .post(`/api/entries/trips/${tripId}/entries`)
          .set(auth())
          .field('type', 'PHOTO')
          .attach('file', filePath)
          .expect(400);

        expect(res.body.error).toMatch(/invalid file type/i);
      } finally {
        cleanup(filePath);
      }
    });

    test('rejects .txt file as VIDEO', async () => {
      const filePath = makeTempFile('notes.txt', 'hello world');
      try {
        const res = await request(app)
          .post(`/api/entries/trips/${tripId}/entries`)
          .set(auth())
          .field('type', 'VIDEO')
          .attach('file', filePath)
          .expect(400);

        expect(res.body.error).toMatch(/invalid file type/i);
      } finally {
        cleanup(filePath);
      }
    });

    test('rejects .pdf file as VOICE', async () => {
      const filePath = makeTempFile('document.pdf', Buffer.alloc(100, 0));
      try {
        const res = await request(app)
          .post(`/api/entries/trips/${tripId}/entries`)
          .set(auth())
          .field('type', 'VOICE')
          .attach('file', filePath)
          .expect(400);

        expect(res.body.error).toMatch(/invalid file type/i);
      } finally {
        cleanup(filePath);
      }
    });

    test('rejects .html file as PHOTO', async () => {
      const filePath = makeTempFile('page.html', '<html></html>');
      try {
        const res = await request(app)
          .post(`/api/entries/trips/${tripId}/entries`)
          .set(auth())
          .field('type', 'PHOTO')
          .attach('file', filePath)
          .expect(400);

        expect(res.body.error).toMatch(/invalid file type/i);
      } finally {
        cleanup(filePath);
      }
    });

    test('rejects .js file as VIDEO', async () => {
      const filePath = makeTempFile('script.js', 'alert(1)');
      try {
        const res = await request(app)
          .post(`/api/entries/trips/${tripId}/entries`)
          .set(auth())
          .field('type', 'VIDEO')
          .attach('file', filePath)
          .expect(400);

        expect(res.body.error).toMatch(/invalid file type/i);
      } finally {
        cleanup(filePath);
      }
    });
  });

  describe('Oversized files', () => {
    test('rejects file exceeding 50MB limit', async () => {
      // Create a sparse file of 51MB — avoids allocating 51MB in memory
      const filePath = path.join(tmpDir, `test_oversized_${Date.now()}.jpg`);
      if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

      const fh = fs.openSync(filePath, 'w');
      fs.ftruncateSync(fh, 51 * 1024 * 1024);
      fs.closeSync(fh);

      try {
        const res = await request(app)
          .post(`/api/entries/trips/${tripId}/entries`)
          .set(auth())
          .field('type', 'PHOTO')
          .attach('file', filePath);

        // express-fileupload with abortOnLimit returns 413
        expect(res.status).toBe(413);
      } finally {
        cleanup(filePath);
      }
    }, 30000);
  });

  describe('Missing file handling', () => {
    test('creates a TEXT entry without any file', async () => {
      const res = await request(app)
        .post(`/api/entries/trips/${tripId}/entries`)
        .set(auth())
        .field('type', 'TEXT')
        .field('rawText', 'Just text, no file')
        .expect(201);

      expect(res.body.type).toBe('TEXT');
      expect(res.body.rawText).toBe('Just text, no file');
      expect(res.body.contentUrl).toBeNull();
    });

    test('creates a TEXT entry when type omitted and no file attached', async () => {
      const res = await request(app)
        .post(`/api/entries/trips/${tripId}/entries`)
        .set(auth())
        .field('rawText', 'Default type')
        .expect(201);

      expect(res.body.type).toBe('TEXT');
      expect(res.body.contentUrl).toBeNull();
    });
  });

  describe('Valid uploads', () => {
    test('accepts a valid .jpg as PHOTO', async () => {
      const filePath = makeTempFile('photo.jpg', JPEG_BYTES);
      let contentUrl = null;

      try {
        const res = await request(app)
          .post(`/api/entries/trips/${tripId}/entries`)
          .set(auth())
          .field('type', 'PHOTO')
          .attach('file', filePath)
          .expect(201);

        expect(res.body.type).toBe('PHOTO');
        expect(res.body.contentUrl).toMatch(/^\/uploads\//);
        contentUrl = res.body.contentUrl;
      } finally {
        cleanup(filePath);
        if (contentUrl) {
          cleanup(path.join(__dirname, '..', contentUrl.replace(/^\//, '')));
        }
      }
    });

    test('accepts a valid .png as PHOTO', async () => {
      const filePath = makeTempFile('photo.png', PNG_BYTES);
      let contentUrl = null;

      try {
        const res = await request(app)
          .post(`/api/entries/trips/${tripId}/entries`)
          .set(auth())
          .field('type', 'PHOTO')
          .attach('file', filePath)
          .expect(201);

        expect(res.body.type).toBe('PHOTO');
        expect(res.body.contentUrl).toMatch(/^\/uploads\//);
        contentUrl = res.body.contentUrl;
      } finally {
        cleanup(filePath);
        if (contentUrl) {
          cleanup(path.join(__dirname, '..', contentUrl.replace(/^\//, '')));
        }
      }
    });

    test('accepts a valid .mp3 as VOICE', async () => {
      // Minimal MP3-like file with ID3 header
      const MP3_BYTES = Buffer.concat([
        Buffer.from('ID3\x04\x00\x00\x00\x00\x00\x00'),
        Buffer.alloc(100, 0),
      ]);
      const filePath = makeTempFile('voice.mp3', MP3_BYTES);
      let contentUrl = null;

      try {
        const res = await request(app)
          .post(`/api/entries/trips/${tripId}/entries`)
          .set(auth())
          .field('type', 'VOICE')
          .attach('file', filePath)
          .expect(201);

        expect(res.body.type).toBe('VOICE');
        expect(res.body.contentUrl).toMatch(/^\/uploads\//);
        contentUrl = res.body.contentUrl;
      } finally {
        cleanup(filePath);
        if (contentUrl) {
          cleanup(path.join(__dirname, '..', contentUrl.replace(/^\//, '')));
        }
      }
    });
  });
});
