// backend/src/routes/trips.js  (Phase 4 — replaces existing file)
// Key additions:
//   - All mutating endpoints now require auth
//   - Trip creation enforces FREE tier limit (max 3)
//   - Trip listing scoped to authenticated user
//   - Archive endpoint
//   - Role-based access on sensitive operations

import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, optionalAuth, requireTripRole } from '../middleware/auth.js';
import { enforceTripLimit } from '../middleware/subscription.js';

const router = Router();

// ── GET /trips — list my trips ────────────────────────────────────────────────

router.get('/', requireAuth, async (req, res) => {
  const { archived } = req.query;

  const memberships = await prisma.tripMembership.findMany({
    where: {
      userId: req.user.id,
      trip: { archived: archived === 'true' ? true : false },
    },
    include: {
      trip: {
        include: {
          _count: { select: { entries: true, memberships: true } },
        },
      },
    },
    orderBy: { joinedAt: 'desc' },
  });

  res.json({
    trips: memberships.map(m => ({
      ...m.trip,
      role: m.role,
      joinedAt: m.joinedAt,
    })),
  });
});

// ── POST /trips — create trip ─────────────────────────────────────────────────

const createSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
});

router.post('/', requireAuth, enforceTripLimit, async (req, res) => {
  const result = createSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(422).json({ error: result.error.errors[0].message });
  }

  const trip = await prisma.trip.create({
    data: {
      ...result.data,
      memberships: {
        create: { userId: req.user.id, role: 'OWNER' },
      },
    },
    include: {
      _count: { select: { entries: true, memberships: true } },
    },
  });

  res.status(201).json({ trip, role: 'OWNER' });
});

// ── POST /trips/:code/join — join by invite code ──────────────────────────────

router.post('/:code/join', requireAuth, async (req, res) => {
  const trip = await prisma.trip.findUnique({
    where: { inviteCode: req.params.code },
  });
  if (!trip) return res.status(404).json({ error: 'Invalid invite code' });
  if (trip.archived) return res.status(410).json({ error: 'This trip is archived' });

  // Upsert so joining twice is idempotent
  const membership = await prisma.tripMembership.upsert({
    where: { userId_tripId: { userId: req.user.id, tripId: trip.id } },
    update: {},
    create: { userId: req.user.id, tripId: trip.id, role: 'EDITOR' },
  });

  res.json({ trip, role: membership.role });
});

// ── GET /trips/:id — trip details ─────────────────────────────────────────────

router.get('/:id', requireAuth, requireTripRole('VIEWER'), async (req, res) => {
  const trip = await prisma.trip.findUnique({
    where: { id: req.params.id },
    include: {
      _count: { select: { entries: true, memberships: true } },
    },
  });
  if (!trip) return res.status(404).json({ error: 'Trip not found' });
  res.json({ trip, role: req.membership.role });
});

// ── PATCH /trips/:id — update trip ───────────────────────────────────────────

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
});

router.patch('/:id', requireAuth, requireTripRole('OWNER'), async (req, res) => {
  const result = updateSchema.safeParse(req.body);
  if (!result.success) return res.status(422).json({ error: result.error.errors[0].message });

  const trip = await prisma.trip.update({
    where: { id: req.params.id },
    data: result.data,
  });
  res.json({ trip });
});

// ── POST /trips/:id/archive — soft-delete ────────────────────────────────────

router.post('/:id/archive', requireAuth, requireTripRole('OWNER'), async (req, res) => {
  const trip = await prisma.trip.update({
    where: { id: req.params.id },
    data: { archived: true },
  });
  res.json({ trip });
});

router.post('/:id/unarchive', requireAuth, requireTripRole('OWNER'), async (req, res) => {
  const trip = await prisma.trip.update({
    where: { id: req.params.id },
    data: { archived: false },
  });
  res.json({ trip });
});

// ── GET /trips/:id/feed — paginated feed ─────────────────────────────────────

router.get('/:id/feed', requireAuth, requireTripRole('VIEWER'), async (req, res) => {
  const cursor = req.query.cursor;
  const limit = Math.min(parseInt(req.query.limit) || 20, 50);

  const entries = await prisma.entry.findMany({
    where: { tripId: req.params.id },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    orderBy: { createdAt: 'desc' },
    include: {
      user: { select: { id: true, name: true, avatarUrl: true } },
      reactions: true,
      comments: {
        include: { user: { select: { id: true, name: true, avatarUrl: true } } },
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  const hasMore = entries.length > limit;
  const page = hasMore ? entries.slice(0, limit) : entries;

  res.json({
    entries: page,
    nextCursor: hasMore ? page[page.length - 1].id : null,
  });
});

// ── GET /trips/:id/members ────────────────────────────────────────────────────

router.get('/:id/members', requireAuth, requireTripRole('VIEWER'), async (req, res) => {
  const members = await prisma.tripMembership.findMany({
    where: { tripId: req.params.id },
    include: { user: { select: { id: true, name: true, avatarUrl: true, email: true } } },
    orderBy: { joinedAt: 'asc' },
  });
  res.json({ members });
});

// ── PATCH /trips/:id/members/:userId — change role ───────────────────────────

router.patch('/:id/members/:userId', requireAuth, requireTripRole('OWNER'), async (req, res) => {
  const { role } = req.body;
  if (!['EDITOR', 'VIEWER'].includes(role)) {
    return res.status(422).json({ error: 'Role must be EDITOR or VIEWER' });
  }
  // Cannot demote yourself
  if (req.params.userId === req.user.id) {
    return res.status(400).json({ error: 'Cannot change your own role' });
  }

  const membership = await prisma.tripMembership.update({
    where: { userId_tripId: { userId: req.params.userId, tripId: req.params.id } },
    data: { role },
  });
  res.json({ membership });
});

export default router;
