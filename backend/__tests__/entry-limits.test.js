const request = require('supertest');
const { createApp } = require('../src/app');
const { prisma } = require('../src/lib/prisma');
const bcrypt = require('bcrypt');

let app;
let freeUser, proUser;
let freeToken, proToken;
let freeTripId, proTripId;

// Use a low limit so tests run fast — we set FREE to 3 via direct DB manipulation
const TEST_FREE_LIMIT = 3;

beforeAll(async () => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-for-integration-tests';
  process.env.NODE_ENV = 'test';

  await prisma.user.deleteMany({ where: { email: { in: ['entry-free@test.com', 'entry-pro@test.com'] } } });

  freeUser = await prisma.user.create({
    data: { name: 'Entry Free', email: 'entry-free@test.com', passwordHash: await bcrypt.hash('password123', 4), tier: 'FREE' },
  });

  proUser = await prisma.user.create({
    data: { name: 'Entry Pro', email: 'entry-pro@test.com', passwordHash: await bcrypt.hash('password123', 4), tier: 'PRO' },
  });

  // Create trips
  const freeTrip = await prisma.trip.create({
    data: {
      title: 'Free Limit Test Trip',
      destination: 'Tokyo, Japan',
      inviteCode: 'FREELIM',
      ownerId: freeUser.id,
      memberships: { create: { userId: freeUser.id, role: 'OWNER' } },
    },
  });
  freeTripId = freeTrip.id;

  const proTrip = await prisma.trip.create({
    data: {
      title: 'Pro Limit Test Trip',
      destination: 'Tokyo, Japan',
      inviteCode: 'PROLIM1',
      ownerId: proUser.id,
      memberships: { create: { userId: proUser.id, role: 'OWNER' } },
    },
  });
  proTripId = proTrip.id;

  app = createApp();

  const freeRes = await request(app)
    .post('/api/auth/login')
    .send({ email: 'entry-free@test.com', password: 'password123' });
  freeToken = freeRes.body.accessToken;

  const proRes = await request(app)
    .post('/api/auth/login')
    .send({ email: 'entry-pro@test.com', password: 'password123' });
  proToken = proRes.body.accessToken;
});

afterAll(async () => {
  await prisma.trip.deleteMany({ where: { ownerId: { in: [freeUser.id, proUser.id] } } });
  await prisma.user.deleteMany({ where: { email: { in: ['entry-free@test.com', 'entry-pro@test.com'] } } });
  await prisma.$disconnect();
});

function auth(token) {
  return { Authorization: `Bearer ${token}` };
}

// We can't easily change TIER_LIMITS at runtime, so we test the actual middleware behavior:
// FREE = 50, PRO = Infinity. For a fast test we seed entries directly via Prisma to get
// close to the limit, then test the HTTP endpoint for the blocking case.
describe('Entry Limit Enforcement', () => {
  test('FREE user can create text entries', async () => {
    const res = await request(app)
      .post(`/api/entries/trips/${freeTripId}/entries`)
      .set(auth(freeToken))
      .send({ type: 'TEXT', rawText: 'Hello world' })
      .expect(201);

    expect(res.body.id).toBeDefined();
    expect(res.body.rawText).toBe('Hello world');
  });

  test('FREE user is blocked when entry count reaches the tier limit', async () => {
    // Seed entries to reach the FREE limit (50). We already created 1 via HTTP.
    const remaining = 50 - 1;
    const entries = [];
    for (let i = 0; i < remaining; i++) {
      entries.push({
        tripId: freeTripId,
        userId: freeUser.id,
        type: 'TEXT',
        rawText: `Seeded entry ${i}`,
      });
    }
    await prisma.entry.createMany({ data: entries });

    // Now the trip has exactly 50 entries — next one should be blocked
    const res = await request(app)
      .post(`/api/entries/trips/${freeTripId}/entries`)
      .set(auth(freeToken))
      .send({ type: 'TEXT', rawText: 'Should be blocked' })
      .expect(403);

    expect(res.body.code).toBe('ENTRY_LIMIT_REACHED');
    expect(res.body.limit).toBe(50);
    expect(res.body.current).toBeGreaterThanOrEqual(50);
  });

  test('PRO user is never blocked by entry limits', async () => {
    // Seed 51 entries for PRO user (beyond FREE limit)
    const entries = [];
    for (let i = 0; i < 51; i++) {
      entries.push({
        tripId: proTripId,
        userId: proUser.id,
        type: 'TEXT',
        rawText: `Pro entry ${i}`,
      });
    }
    await prisma.entry.createMany({ data: entries });

    // PRO should still be able to create entries
    const res = await request(app)
      .post(`/api/entries/trips/${proTripId}/entries`)
      .set(auth(proToken))
      .send({ type: 'TEXT', rawText: 'Pro user entry beyond FREE limit' })
      .expect(201);

    expect(res.body.id).toBeDefined();
  });

  test('entry limit counts entries for the correct trip', async () => {
    const freeCount = await prisma.entry.count({ where: { tripId: freeTripId } });
    expect(freeCount).toBeGreaterThanOrEqual(50);

    const proCount = await prisma.entry.count({ where: { tripId: proTripId } });
    expect(proCount).toBeGreaterThanOrEqual(51);
  });
});
