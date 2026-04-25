const request = require('supertest');
const { createApp } = require('../src/app');
const { prisma } = require('../src/lib/prisma');
const bcrypt = require('bcrypt');

let app;
let freeUser, premiumUser;
let freeToken, premiumToken;

const FREE_LIMIT = 3;

beforeAll(async () => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-for-integration-tests';
  process.env.NODE_ENV = 'test';

  // Clean up test users from previous runs
  await prisma.user.deleteMany({ where: { email: { in: ['free@test.com', 'premium@test.com'] } } });

  // Create FREE user
  freeUser = await prisma.user.create({
    data: { name: 'Free User', email: 'free@test.com', passwordHash: await bcrypt.hash('password123', 4), tier: 'FREE' },
  });

  // Create PREMIUM user
  premiumUser = await prisma.user.create({
    data: { name: 'Premium User', email: 'premium@test.com', passwordHash: await bcrypt.hash('password123', 4), tier: 'PREMIUM' },
  });

  app = createApp();

  // Get tokens via login
  const freeRes = await request(app)
    .post('/api/auth/login')
    .send({ email: 'free@test.com', password: 'password123' });
  freeToken = freeRes.body.accessToken;

  const premRes = await request(app)
    .post('/api/auth/login')
    .send({ email: 'premium@test.com', password: 'password123' });
  premiumToken = premRes.body.accessToken;
});

afterAll(async () => {
  // Clean up trips created during tests
  const users = await prisma.user.findMany({ where: { email: { in: ['free@test.com', 'premium@test.com'] } } });
  for (const u of users) {
    await prisma.trip.deleteMany({ where: { ownerId: u.id } });
  }
  await prisma.user.deleteMany({ where: { email: { in: ['free@test.com', 'premium@test.com'] } } });
  await prisma.$disconnect();
});

function auth(token) {
  return { Authorization: `Bearer ${token}` };
}

describe('Trip Limit Enforcement', () => {
  const createdTripIds = [];

  afterAll(async () => {
    // Clean up trips created in these tests
    for (const id of createdTripIds) {
      try { await prisma.trip.delete({ where: { id } }); } catch {}
    }
  });

  test('FREE user can create trips up to the limit', async () => {
    for (let i = 0; i < FREE_LIMIT; i++) {
      const res = await request(app)
        .post('/api/trips')
        .set(auth(freeToken))
        .send({ title: `Free Trip ${i + 1}` })
        .expect(201);

      expect(res.body.trip.id).toBeDefined();
      expect(res.body.trip.ownerId).toBe(freeUser.id);
      createdTripIds.push(res.body.trip.id);
    }
  });

  test('FREE user is blocked from creating trips beyond the limit', async () => {
    const res = await request(app)
      .post('/api/trips')
      .set(auth(freeToken))
      .send({ title: 'Should Fail Trip' })
      .expect(403);

    expect(res.body.code).toBe('TRIP_LIMIT_REACHED');
    expect(res.body.limit).toBe(FREE_LIMIT);
    expect(res.body.current).toBe(FREE_LIMIT);
  });

  test('FREE user limit counts by ownerId, not memberships', async () => {
    // Verify the trips are counted correctly via the list endpoint
    const res = await request(app)
      .get('/api/trips')
      .set(auth(freeToken))
      .expect(200);

    expect(res.body.trips.length).toBe(FREE_LIMIT);
  });

  test('PREMIUM user can create trips beyond the FREE limit', async () => {
    for (let i = 0; i < FREE_LIMIT + 2; i++) {
      const res = await request(app)
        .post('/api/trips')
        .set(auth(premiumToken))
        .send({ title: `Premium Trip ${i + 1}` })
        .expect(201);

      expect(res.body.trip.ownerId).toBe(premiumUser.id);
      createdTripIds.push(res.body.trip.id);
    }
  });

  test('ownerId is set on every created trip', async () => {
    const trip = await prisma.trip.findFirst({
      where: { ownerId: freeUser.id },
    });
    expect(trip).not.toBeNull();
    expect(trip.ownerId).toBe(freeUser.id);
  });

  test('trip count query uses ownerId correctly', async () => {
    const freeCount = await prisma.trip.count({
      where: { ownerId: freeUser.id, status: 'ACTIVE' },
    });
    expect(freeCount).toBe(FREE_LIMIT);

    const premCount = await prisma.trip.count({
      where: { ownerId: premiumUser.id, status: 'ACTIVE' },
    });
    expect(premCount).toBe(FREE_LIMIT + 2);
  });
});
