const request = require('supertest');
const { createApp } = require('../src/app');
const { prisma } = require('../src/lib/prisma');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

const sha256 = (raw) => crypto.createHash('sha256').update(raw).digest('hex');

let app;
let user;
let accessToken;

const TEST_EMAIL = 'reset-test@test.com';
const TEST_PASSWORD = 'password123';

beforeAll(async () => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-for-integration-tests';
  process.env.NODE_ENV = 'test';

  await prisma.user.deleteMany({ where: { email: TEST_EMAIL } });

  user = await prisma.user.create({
    data: { name: 'Reset Test', email: TEST_EMAIL, passwordHash: await bcrypt.hash(TEST_PASSWORD, 4) },
  });

  app = createApp();

  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: TEST_EMAIL, password: TEST_PASSWORD })
    .expect(200);
  accessToken = res.body.accessToken;
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: TEST_EMAIL } });
  await prisma.$disconnect();
});

function auth() {
  return { Authorization: `Bearer ${accessToken}` };
}

describe('Password Reset Flow', () => {
  // ── POST /forgot-password ──────────────────────────────────────────────────
  describe('POST /api/auth/forgot-password', () => {
    test('returns success for known email', async () => {
      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: TEST_EMAIL })
        .expect(200);

      expect(res.body.message).toMatch(/reset link has been sent/i);
    });

    test('returns same message for unknown email (no enumeration)', async () => {
      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'nonexistent@test.com' })
        .expect(200);

      expect(res.body.message).toMatch(/reset link has been sent/i);
    });

    test('returns 400 when email is missing', async () => {
      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({})
        .expect(400);

      expect(res.body.error).toMatch(/email is required/i);
    });
  });

  // ── POST /reset-password — invalid / expired tokens ────────────────────────
  describe('POST /api/auth/reset-password', () => {
    test('returns 400 when token is missing', async () => {
      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({ password: 'newpassword1' })
        .expect(400);

      expect(res.body.error).toMatch(/token and password/i);
    });

    test('returns 400 when password is missing', async () => {
      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({ token: 'sometoken' })
        .expect(400);

      expect(res.body.error).toMatch(/token and password/i);
    });

    test('rejects a completely invalid token', async () => {
      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({ token: 'invalid-token-value', password: 'newpassword1' })
        .expect(400);

      expect(res.body.error).toMatch(/invalid or expired/i);
    });

    test('rejects a token with expired timestamp', async () => {
      // Insert a reset token that already expired
      const rawToken = crypto.randomBytes(32).toString('hex');
      const expiredDate = new Date();
      expiredDate.setHours(expiredDate.getHours() - 3); // 3 hours ago (expiry is 2h)

      await prisma.user.update({
        where: { id: user.id },
        data: {
          passwordResetTokenHash: sha256(rawToken),
          passwordResetExpiry: expiredDate,
        },
      });

      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({ token: rawToken, password: 'newpassword1' })
        .expect(400);

      expect(res.body.error).toMatch(/invalid or expired/i);
    });
  });

  // ── Successful reset flow ──────────────────────────────────────────────────
  describe('Successful password reset', () => {
    test('resets password with a valid token, then login works with new password', async () => {
      // Insert a fresh reset token directly
      const rawToken = crypto.randomBytes(32).toString('hex');
      const expiry = new Date();
      expiry.setHours(expiry.getHours() + 2);

      await prisma.user.update({
        where: { id: user.id },
        data: {
          passwordResetTokenHash: sha256(rawToken),
          passwordResetExpiry: expiry,
        },
      });

      // Also create a refresh token to verify it gets revoked
      const refreshTokenRes = await request(app)
        .post('/api/auth/login')
        .send({ email: TEST_EMAIL, password: TEST_PASSWORD })
        .expect(200);
      const oldRefreshToken = refreshTokenRes.body.refreshToken;

      // Reset the password
      const newPassword = 'brandNewPass123';
      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({ token: rawToken, password: newPassword })
        .expect(200);

      expect(res.body.message).toMatch(/reset successfully/i);

      // Old password should no longer work
      await request(app)
        .post('/api/auth/login')
        .send({ email: TEST_EMAIL, password: TEST_PASSWORD })
        .expect(401);

      // New password should work
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: TEST_EMAIL, password: newPassword })
        .expect(200);

      expect(loginRes.body.accessToken).toBeDefined();

      // Old refresh token should be revoked
      await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: oldRefreshToken })
        .expect(401);

      // Reset token should be cleared from DB
      const updatedUser = await prisma.user.findUnique({ where: { id: user.id } });
      expect(updatedUser.passwordResetTokenHash).toBeNull();
      expect(updatedUser.passwordResetExpiry).toBeNull();

      // Update accessToken for cleanup
      accessToken = loginRes.body.accessToken;
    });

    test('reset token cannot be reused after successful reset', async () => {
      // Insert a fresh reset token
      const rawToken = crypto.randomBytes(32).toString('hex');
      const expiry = new Date();
      expiry.setHours(expiry.getHours() + 2);

      await prisma.user.update({
        where: { id: user.id },
        data: {
          passwordResetTokenHash: sha256(rawToken),
          passwordResetExpiry: expiry,
        },
      });

      // Use it once — succeeds
      await request(app)
        .post('/api/auth/reset-password')
        .send({ token: rawToken, password: 'anotherNewPass1' })
        .expect(200);

      // Use it again — should fail (token was cleared from DB)
      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({ token: rawToken, password: 'yetAnotherPass1' })
        .expect(400);

      expect(res.body.error).toMatch(/invalid or expired/i);

      // Login with the latest password works
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: TEST_EMAIL, password: 'anotherNewPass1' })
        .expect(200);

      accessToken = loginRes.body.accessToken;
    });
  });
});
