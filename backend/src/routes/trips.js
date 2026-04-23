const router = require('express').Router();
const { prisma } = require('../lib/prisma');
const { requireUser } = require('../middleware/session');

const FREE_TRIP_LIMIT = 3;

async function checkTripLimit(req, res, next) {
  if (!req.user?.id) return next();
  
  const count = await prisma.trip.count({
    where: { memberships: { some: { userId: req.user.id } } },
  });
  
  if (count >= FREE_TRIP_LIMIT) {
    return res.status(403).json({
      error: 'Free tier limit reached',
      message: 'Upgrade to Premium for unlimited trips',
      limit: FREE_TRIP_LIMIT
    });
  }
  
  next();
}

function generateInviteCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

// GET /api/trips
router.get('/', requireUser, async (req, res, next) => {
  try {
    const trips = await prisma.trip.findMany({
      where: { memberships: { some: { userId: req.user.id } } },
      select: { id: true, title: true, destination: true, startDate: true, endDate: true, inviteCode: true, status: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ trips });
  } catch (err) {
    next(err);
  }
});

// POST /api/trips
router.post('/', requireUser, checkTripLimit, async (req, res, next) => {
  try {
    const { title, destination, startDate, endDate } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: 'title is required' });

    let inviteCode;
    let attempts = 0;
    do {
      inviteCode = generateInviteCode();
      attempts++;
      if (attempts > 10) throw new Error('Failed to generate unique invite code');
    } while (await prisma.trip.findUnique({ where: { inviteCode } }));

    const trip = await prisma.trip.create({
      data: {
        title: title.trim(),
        destination: destination || 'Tokyo, Japan',
        inviteCode,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        memberships: { create: { userId: req.user.id, role: 'OWNER' } },
      },
    });

    res.status(201).json({ trip, membership: { role: 'OWNER' } });
  } catch (err) {
    next(err);
  }
});

// POST /api/trips/:code/join
router.post('/:code/join', requireUser, async (req, res, next) => {
  try {
    const { code } = req.params;
    const trip = await prisma.trip.findUnique({ where: { inviteCode: code.toUpperCase() } });
    if (!trip) return res.status(404).json({ error: 'Trip not found' });
    if (trip.status === 'ARCHIVED') return res.status(410).json({ error: 'This trip has ended' });

    const membership = await prisma.tripMembership.upsert({
      where: { userId_tripId: { userId: req.user.id, tripId: trip.id } },
      update: {},
      create: { userId: req.user.id, tripId: trip.id, role: 'MEMBER' },
    });

    const fullTrip = await prisma.trip.findUnique({
      where: { id: trip.id },
      include: { memberships: { include: { user: true } }, _count: { select: { entries: true } } },
    });

    res.json({ trip: fullTrip, membership });
  } catch (err) {
    next(err);
  }
});

// GET /api/trips/:id
router.get('/:id', requireUser, async (req, res, next) => {
  try {
    const trip = await prisma.trip.findUnique({
      where: { id: req.params.id },
      include: { memberships: { include: { user: true } }, _count: { select: { entries: true } } },
    });
    if (!trip) return res.status(404).json({ error: 'Trip not found' });
    const isMember = trip.memberships.some(m => m.userId === req.user.id);
    if (!isMember) return res.status(403).json({ error: 'Not a member' });
    res.json({ trip });
  } catch (err) {
    next(err);
  }
});

// GET /api/trips/:id/feed
router.get('/:id/feed', requireUser, async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);
    const cursor = req.query.cursor;

    const membership = await prisma.tripMembership.findUnique({
      where: { userId_tripId: { userId: req.user.id, tripId: req.params.id } },
    });
    if (!membership) return res.status(403).json({ error: 'Not a member' });

    const entries = await prisma.entry.findMany({
      where: { tripId: req.params.id },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      include: { user: { select: { id: true, name: true, avatar: true } }, reactions: { include: { user: { select: { id: true, name: true } } } }, comments: { include: { user: { select: { id: true, name: true, avatar: true } } }, orderBy: { createdAt: 'asc' }, take: 3 }, _count: { select: { comments: true } } },
    });

    const hasMore = entries.length > limit;
    const items = hasMore ? entries.slice(0, limit) : entries;
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    res.json({ entries: items, pagination: { hasMore, nextCursor, limit } });
  } catch (err) {
    next(err);
  }
});

// GET /api/trips/:id/members
router.get('/:id/members', requireUser, async (req, res, next) => {
  try {
    const members = await prisma.tripMembership.findMany({
      where: { tripId: req.params.id },
      include: { user: true },
      orderBy: { joinedAt: 'asc' },
    });
    res.json({ members });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/trips/:id - Leave or delete based on ownership
router.delete('/:id', requireUser, async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const membership = await prisma.tripMembership.findUnique({
      where: { userId_tripId: { userId: req.user.id, tripId: id } },
    });
    
    if (!membership) {
      return res.status(404).json({ error: 'Not a member of this trip' });
    }
    
    if (membership.role !== 'OWNER') {
      // Member - just leave
      await prisma.tripMembership.delete({
        where: { userId_tripId: { userId: req.user.id, tripId: id } },
      });
    } else {
      // Owner - check if other owners exist
      const otherOwners = await prisma.tripMembership.count({
        where: { tripId: id, role: 'OWNER', userId: { not: req.user.id } },
      });
      
      if (otherOwners > 0) {
        // Other owners exist - leave the group
        await prisma.tripMembership.delete({
          where: { userId_tripId: { userId: req.user.id, tripId: id } },
        });
      } else {
        // Only owner - delete entire trip
        await prisma.trip.delete({ where: { id } });
      }
    }
    
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;