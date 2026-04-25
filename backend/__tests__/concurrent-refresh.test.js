const request = require('supertest');
const { createApp } = require('../src/app');
const { prisma } = require('../src/lib/prisma');
const bcrypt = require('bcrypt');

let app;
let user, accessToken, refreshToken;

const TEST_EMAIL = 'concurrent-refresh@test.com';

beforeAll(async () => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-for-integration-tests';
  process.env.NODE_ENV = 'test';

  await prisma.user.deleteMany({ where: { email: TEST_EMAIL } });

  user = await prisma.user.create({
    data: { name: 'Conc Test', email: TEST_EMAIL, passwordHash: await bcrypt.hash('password123', 4) },
  });

  app = createApp();

  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: TEST_EMAIL, password: 'password123' })
    .expect(200);

  accessToken = res.body.accessToken;
  refreshToken = res.body.refreshToken;
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: TEST_EMAIL } });
  await prisma.$disconnect();
});

describe('Concurrent Refresh Token Rotation', () => {
  test('two simultaneous refreshes with the same token — one wins, one triggers reuse detection', async () => {
    // Fire two refresh requests at the exact same time with the same token
    const [resA, resB] = await Promise.allSettled([
      request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken }),
      request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken }),
    ]);

    const resultA = resA.status === 'fulfilled' ? resA.value : null;
    const resultB = resB.status === 'fulfilled' ? resB.value : null;

    // One should succeed (200), one should fail (401) — never both succeed
    const statuses = [resultA.status, resultB.status].sort();
    expect(statuses).toContain(200);
    expect(statuses).toContain(401);

    // Find which one failed
    const failRes = resultA.status === 401 ? resultA : resultB;

    // The failed one should indicate reuse detection
    expect(failRes.body.error).toMatch(/already used|not found/i);
  });

  test('after reuse detection, user can re-login to get a fresh token family', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: TEST_EMAIL, password: 'password123' })
      .expect(200);

    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();

    // New refresh token should work
    await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: res.body.refreshToken })
      .expect(200);
  });

  test('sequential rotations work correctly — no false reuse detection', async () => {
    // Login fresh
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: TEST_EMAIL, password: 'password123' })
      .expect(200);

    let token = login.body.refreshToken;

    // Chain 3 sequential rotations
    for (let i = 0; i < 3; i++) {
      const res = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: token })
        .expect(200);

      expect(res.body.refreshToken).toBeDefined();
      expect(res.body.refreshToken).not.toBe(token);
      token = res.body.refreshToken;
    }
  });
});
