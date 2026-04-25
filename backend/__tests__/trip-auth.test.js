const request = require('supertest');
const { createApp } = require('../src/app');
const { prisma } = require('../src/lib/prisma');
const bcrypt = require('bcrypt');

let app;
let owner, member, outsider;
let ownerToken, memberToken, outsiderToken;
let tripId;

beforeAll(async () => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-for-integration-tests';
  process.env.NODE_ENV = 'test';

  const emails = ['auth-owner@test.com', 'auth-member@test.com', 'auth-outsider@test.com'];
  await prisma.user.deleteMany({ where: { email: { in: emails } } });

  owner = await prisma.user.create({
    data: { name: 'Owner', email: emails[0], passwordHash: await bcrypt.hash('password123', 4) },
  });
  member = await prisma.user.create({
    data: { name: 'Member', email: emails[1], passwordHash: await bcrypt.hash('password123', 4) },
  });
  outsider = await prisma.user.create({
    data: { name: 'Outsider', email: emails[2], passwordHash: await bcrypt.hash('password123', 4) },
  });

  const trip = await prisma.trip.create({
    data: {
      title: 'Auth Test Trip',
      destination: 'Tokyo, Japan',
      inviteCode: 'AUTHTE',
      ownerId: owner.id,
      memberships: {
        create: [
          { userId: owner.id, role: 'OWNER' },
          { userId: member.id, role: 'MEMBER' },
        ],
      },
    },
  });
  tripId = trip.id;

  app = createApp();

  const [ownerRes, memberRes, outsiderRes] = await Promise.all([
    request(app).post('/api/auth/login').send({ email: emails[0], password: 'password123' }),
    request(app).post('/api/auth/login').send({ email: emails[1], password: 'password123' }),
    request(app).post('/api/auth/login').send({ email: emails[2], password: 'password123' }),
  ]);
  ownerToken = ownerRes.body.accessToken;
  memberToken = memberRes.body.accessToken;
  outsiderToken = outsiderRes.body.accessToken;
});

afterAll(async () => {
  const emails = ['auth-owner@test.com', 'auth-member@test.com', 'auth-outsider@test.com'];
  await prisma.trip.deleteMany({ where: { ownerId: { in: [owner.id, member.id, outsider.id] } } });
  await prisma.user.deleteMany({ where: { email: { in: emails } } });
  await prisma.$disconnect();
});

function auth(token) {
  return { Authorization: `Bearer ${token}` };
}

describe('Trip Ownership & Authorization', () => {
  // ── GET /:id ────────────────────────────────────────────────────────────────
  describe('GET /api/trips/:id', () => {
    test('owner can view trip', async () => {
      const res = await request(app)
        .get(`/api/trips/${tripId}`)
        .set(auth(ownerToken))
        .expect(200);
      expect(res.body.trip.id).toBe(tripId);
    });

    test('member can view trip', async () => {
      const res = await request(app)
        .get(`/api/trips/${tripId}`)
        .set(auth(memberToken))
        .expect(200);
      expect(res.body.trip.id).toBe(tripId);
    });

    test('non-member gets 403', async () => {
      const res = await request(app)
        .get(`/api/trips/${tripId}`)
        .set(auth(outsiderToken))
        .expect(403);
      expect(res.body.error).toMatch(/not a member/i);
    });

    test('unauthenticated user gets 401', async () => {
      await request(app)
        .get(`/api/trips/${tripId}`)
        .expect(401);
    });
  });

  // ── GET /:id/feed ──────────────────────────────────────────────────────────
  describe('GET /api/trips/:id/feed', () => {
    test('owner can view feed', async () => {
      await request(app)
        .get(`/api/trips/${tripId}/feed`)
        .set(auth(ownerToken))
        .expect(200);
    });

    test('member can view feed', async () => {
      await request(app)
        .get(`/api/trips/${tripId}/feed`)
        .set(auth(memberToken))
        .expect(200);
    });

    test('non-member cannot view feed', async () => {
      const res = await request(app)
        .get(`/api/trips/${tripId}/feed`)
        .set(auth(outsiderToken))
        .expect(403);
      expect(res.body.error).toMatch(/not a member/i);
    });
  });

  // ── PATCH /:id (update trip) ──────────────────────────────────────────────
  describe('PATCH /api/trips/:id', () => {
    test('owner can update trip', async () => {
      const res = await request(app)
        .patch(`/api/trips/${tripId}`)
        .set(auth(ownerToken))
        .send({ title: 'Updated Title' })
        .expect(200);
      expect(res.body.trip.title).toBe('Updated Title');
    });

    test('member cannot update trip', async () => {
      const res = await request(app)
        .patch(`/api/trips/${tripId}`)
        .set(auth(memberToken))
        .send({ title: 'Member Hack' })
        .expect(403);
      expect(res.body.error).toMatch(/only owners/i);
    });

    test('outsider cannot update trip', async () => {
      await request(app)
        .patch(`/api/trips/${tripId}`)
        .set(auth(outsiderToken))
        .send({ title: 'Outsider Hack' })
        .expect(403);
    });
  });

  // ── POST /:id/archive ─────────────────────────────────────────────────────
  describe('POST /api/trips/:id/archive', () => {
    test('member cannot archive trip', async () => {
      const res = await request(app)
        .post(`/api/trips/${tripId}/archive`)
        .set(auth(memberToken))
        .expect(403);
      expect(res.body.error).toMatch(/only owners/i);
    });

    test('outsider cannot archive trip', async () => {
      await request(app)
        .post(`/api/trips/${tripId}/archive`)
        .set(auth(outsiderToken))
        .expect(403);
    });

    test('owner can archive trip', async () => {
      // First unarchive so we can archive
      await request(app)
        .patch(`/api/trips/${tripId}`)
        .set(auth(ownerToken))
        .send({ status: 'ACTIVE' });

      const res = await request(app)
        .post(`/api/trips/${tripId}/archive`)
        .set(auth(ownerToken))
        .expect(200);
      expect(res.body.status).toBe('ARCHIVED');
    });

    test('cannot join an archived trip', async () => {
      const res = await request(app)
        .post('/api/trips/AUTHTE/join')
        .set(auth(outsiderToken))
        .expect(410);
      expect(res.body.error).toMatch(/ended/i);
    });
  });

  // ── DELETE /:id ────────────────────────────────────────────────────────────
  describe('DELETE /api/trips/:id (leave/delete)', () => {
    let memberOnlyTripId;

    beforeAll(async () => {
      // Unarchive the main trip for subsequent tests
      await request(app)
        .patch(`/api/trips/${tripId}`)
        .set(auth(ownerToken))
        .send({ status: 'ACTIVE' });

      // Create a trip where member is a member, for leave testing
      const trip = await prisma.trip.create({
        data: {
          title: 'Leave Test Trip',
          destination: 'Tokyo',
          inviteCode: 'LEAVET',
          ownerId: owner.id,
          memberships: {
            create: [
              { userId: owner.id, role: 'OWNER' },
              { userId: member.id, role: 'MEMBER' },
            ],
          },
        },
      });
      memberOnlyTripId = trip.id;
    });

    test('member can leave a trip', async () => {
      await request(app)
        .delete(`/api/trips/${memberOnlyTripId}`)
        .set(auth(memberToken))
        .expect(200);

      // Verify membership is gone
      const membership = await prisma.tripMembership.findUnique({
        where: { userId_tripId: { userId: member.id, tripId: memberOnlyTripId } },
      });
      expect(membership).toBeNull();
    });

    test('non-member gets 404 when trying to leave', async () => {
      const res = await request(app)
        .delete(`/api/trips/${memberOnlyTripId}`)
        .set(auth(outsiderToken))
        .expect(404);
      expect(res.body.error).toMatch(/not a member/i);
    });
  });

  // ── PATCH /:id/members/:userId (change role) ──────────────────────────────
  describe('PATCH /api/trips/:id/members/:userId', () => {
    test('owner can change member role', async () => {
      const res = await request(app)
        .patch(`/api/trips/${tripId}/members/${member.id}`)
        .set(auth(ownerToken))
        .send({ role: 'OWNER' })
        .expect(200);
      expect(res.body.membership.role).toBe('OWNER');
    });

    test('member cannot change roles', async () => {
      // member is now OWNER from previous test — use outsider who isn't even a member
      // First, let's revert member back to MEMBER
      await request(app)
        .patch(`/api/trips/${tripId}/members/${member.id}`)
        .set(auth(ownerToken))
        .send({ role: 'MEMBER' });

      const res = await request(app)
        .patch(`/api/trips/${tripId}/members/${owner.id}`)
        .set(auth(memberToken))
        .send({ role: 'MEMBER' })
        .expect(403);
      expect(res.body.error).toMatch(/only owners/i);
    });

    test('rejects invalid role', async () => {
      const res = await request(app)
        .patch(`/api/trips/${tripId}/members/${member.id}`)
        .set(auth(ownerToken))
        .send({ role: 'ADMIN' })
        .expect(400);
      expect(res.body.error).toMatch(/must be OWNER or MEMBER/i);
    });
  });

  // ── POST /:id/transfer-ownership ──────────────────────────────────────────
  describe('POST /api/trips/:id/transfer-ownership', () => {
    test('owner can transfer ownership', async () => {
      const res = await request(app)
        .post(`/api/trips/${tripId}/transfer-ownership`)
        .set(auth(ownerToken))
        .send({ newOwnerId: member.id })
        .expect(200);

      // Verify the trip now shows member as owner
      const memberships = res.body.trip.memberships;
      const newOwner = memberships.find(m => m.userId === member.id);
      const oldOwner = memberships.find(m => m.userId === owner.id);
      expect(newOwner.role).toBe('OWNER');
      expect(oldOwner.role).toBe('MEMBER');
    });

    test('member (now former owner) cannot transfer ownership back', async () => {
      const res = await request(app)
        .post(`/api/trips/${tripId}/transfer-ownership`)
        .set(auth(ownerToken))
        .send({ newOwnerId: owner.id })
        .expect(403);
      expect(res.body.error).toMatch(/only the current owner/i);
    });

    test('cannot transfer to non-member', async () => {
      const res = await request(app)
        .post(`/api/trips/${tripId}/transfer-ownership`)
        .set(auth(memberToken))
        .send({ newOwnerId: outsider.id })
        .expect(404);
      expect(res.body.error).toMatch(/not a member/i);
    });

    // Restore ownership for cleanup
    afterAll(async () => {
      await prisma.tripMembership.update({
        where: { userId_tripId: { userId: member.id, tripId } },
        data: { role: 'OWNER' },
      });
    });
  });
});
