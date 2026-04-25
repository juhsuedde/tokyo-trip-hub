const request = require('supertest');
const { createApp } = require('../src/app');
const { prisma } = require('../src/lib/prisma');

let app;
const TEST_USER = {
  name: 'Test User',
  email: 'test-auth@example.com',
  password: 'password123',
};

beforeAll(async () => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-for-integration-tests';
  process.env.NODE_ENV = 'test';
  // Clean up any leftover test user from previous runs
  try {
    await prisma.user.deleteMany({ where: { email: TEST_USER.email } });
  } catch {}
  app = createApp();
});

afterAll(async () => {
  // Clean up test user
  try {
    await prisma.user.deleteMany({ where: { email: TEST_USER.email } });
  } catch {}
  await prisma.$disconnect();
});

describe('Auth Flow Integration', () => {
  let accessToken;
  let refreshToken;

  test('POST /api/auth/register — creates user and returns tokens', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send(TEST_USER)
      .expect('Content-Type', /json/)
      .expect(201);

    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
    expect(res.body.user).toMatchObject({
      name: TEST_USER.name,
      email: TEST_USER.email,
      tier: 'FREE',
      isAdmin: false,
    });

    accessToken = res.body.accessToken;
    refreshToken = res.body.refreshToken;
  });

  test('POST /api/auth/register — rejects duplicate email', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send(TEST_USER)
      .expect(409);

    expect(res.body.error).toBeDefined();
  });

  test('POST /api/auth/register — rejects invalid input', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ name: '', email: 'not-an-email', password: '12' })
      .expect(400);
  });

  test('GET /api/auth/me — returns user with valid token', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body.user).toMatchObject({
      email: TEST_USER.email,
      name: TEST_USER.name,
      tier: 'FREE',
    });
  });

  test('GET /api/auth/me — rejects without token', async () => {
    await request(app)
      .get('/api/auth/me')
      .expect(401);
  });

  test('POST /api/auth/login — returns tokens for valid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: TEST_USER.email, password: TEST_USER.password })
      .expect(200);

    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
    expect(res.body.user.email).toBe(TEST_USER.email);
  });

  test('POST /api/auth/login — rejects wrong password', async () => {
    await request(app)
      .post('/api/auth/login')
      .send({ email: TEST_USER.email, password: 'wrong-password' })
      .expect(401);
  });

  test('POST /api/auth/login — rejects unknown email', async () => {
    await request(app)
      .post('/api/auth/login')
      .send({ email: 'nonexistent@example.com', password: 'password123' })
      .expect(401);
  });

  test('POST /api/auth/refresh — rotates refresh token', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken })
      .expect(200);

    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
    expect(res.body.refreshToken).not.toBe(refreshToken);

    // New token should work for another rotation
    accessToken = res.body.accessToken;
    refreshToken = res.body.refreshToken;
  });

  test('POST /api/auth/refresh — rejects reused (old) refresh token', async () => {
    // Save the current token, then rotate to get a new one
    const oldToken = refreshToken;

    const res1 = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: oldToken })
      .expect(200);

    const newToken = res1.body.refreshToken;

    // Reusing the old token should trigger reuse detection
    const res2 = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: oldToken })
      .expect(401);

    expect(res2.body.error).toMatch(/already used|not found/i);

    // Re-login to get fresh tokens for remaining tests (family is revoked)
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: TEST_USER.email, password: TEST_USER.password })
      .expect(200);

    accessToken = loginRes.body.accessToken;
    refreshToken = loginRes.body.refreshToken;
  });

  test('POST /api/auth/refresh — rejects missing token', async () => {
    await request(app)
      .post('/api/auth/refresh')
      .send({})
      .expect(401);
  });

  test('POST /api/auth/logout — revokes all refresh tokens', async () => {
    await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    // Refresh token should no longer work
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken })
      .expect(401);

    expect(res.body.error).toBeDefined();
  });
});
