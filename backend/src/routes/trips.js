const router = require('express').Router();
const { prisma } = require('../lib/prisma');
const { requireUser } = require('../middleware/session');
const { CreateTripSchema, validateAsync } = require('../lib/validation');
const { sanitizeHtml } = require('../lib/sanitizer');

const FREE_TRIP_LIMIT = 3;

async function checkTripLimit(req, res, next) {
  if (!req.user?.id) return next();
  
  const count = await prisma.trip.count({
    where: { 
      memberships: { some: { userId: req.user.id } },
      status: { not: 'ARCHIVED' },
    },
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
router.post('/', requireUser, checkTripLimit, validateAsync(CreateTripSchema), async (req, res, next) => {
  try {
    const { title, destination, startDate, endDate } = req.validated;

    // Try to create with a unique invite code (handle race condition)
    const trip = await prisma.trip.create({
      data: {
        title: sanitizeHtml(title.trim()),
        destination: sanitizeHtml(destination) || 'Tokyo, Japan',
        inviteCode: generateInviteCode(),
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        memberships: { create: { userId: req.user.id, role: 'OWNER' } },
      },
    });

    res.status(201).json({ trip, membership: { role: 'OWNER' } });
  } catch (err) {
    if (err.code === 'P2002') {
      // Retry with different code on unique constraint violation
      const trip = await prisma.trip.create({
        data: {
          title: sanitizeHtml(title.trim()),
          destination: sanitizeHtml(destination) || 'Tokyo, Japan',
          inviteCode: generateInviteCode(),
          startDate: startDate ? new Date(startDate) : null,
          endDate: endDate ? new Date(endDate) : null,
          memberships: { create: { userId: req.user.id, role: 'OWNER' } },
        },
      });
      return res.status(201).json({ trip, membership: { role: 'OWNER' } });
    }
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

// POST /api/trips/:id/archive
router.post('/:id/archive', requireUser, async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const membership = await prisma.tripMembership.findUnique({
      where: { userId_tripId: { userId: req.user.id, tripId: id } },
    });
    
    if (!membership || membership.role !== 'OWNER') {
      return res.status(403).json({ error: 'Only owners can archive trips' });
    }
    
    const trip = await prisma.trip.update({
      where: { id },
      data: { status: 'ARCHIVED' },
    });
    
    res.json({ id: trip.id, status: trip.status });
  } catch (err) {
    next(err);
  }
});

// POST /api/trips/:id/duplicate
router.post('/:id/duplicate', requireUser, async (req, res, next) => {
  try {
    const { id } = req.params;
    const original = await prisma.trip.findUnique({
      where: { id },
      include: { entries: true },
    });
    
    if (!original) {
      return res.status(404).json({ error: 'Trip not found' });
    }
    
    const newTrip = await prisma.trip.create({
      data: {
        title: `${original.title} (Copy)`,
        destination: original.destination,
        startDate: original.startDate,
        endDate: original.endDate,
        ownerId: req.user.id,
        status: 'ACTIVE',
        inviteCode: generateInviteCode(),
      },
    });
    
    await prisma.tripMembership.create({
      data: { userId: req.user.id, tripId: newTrip.id, role: 'OWNER' },
    });
    
    res.status(201).json(newTrip);
  } catch (err) {
    next(err);
  }
});

module.exports = router;