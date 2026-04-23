const router = require('express').Router();
const { prisma } = require('../lib/prisma');
const { requireUser } = require('../middleware/session');

// Simple tier check - FREE limit = 3 trips
const FREE_TRIP_LIMIT = 3;

async function checkTripLimit(req, res, next) {
  if (!req.user?.id) {
    return next(); // requireUser will handle auth
  }
  
  const count = await prisma.trip.count({
    where: {
      memberships: {
        some: { userId: req.user.id }
      }
    }
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

// Generate a short, readable invite code
function generateInviteCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

/**
 * GET /api/trips
 * List user's trips
 */
router.get('/', requireUser, async (req, res, next) => {
  try {
    const trips = await prisma.trip.findMany({
      where: {
        memberships: {
          some: { userId: req.user.id }
        }
      },
      select: {
        id: true,
        title: true,
        destination: true,
        startDate: true,
        endDate: true,
        inviteCode: true,
        status: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ trips });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/trips
 * Create a new trip. The creator becomes the OWNER.
 * Body: { title, destination?, startDate?, endDate? }
 */
router.post('/', requireUser, checkTripLimit, async (req, res, next) => {
  try {
    const { title, destination, startDate, endDate } = req.body;
    if (!title?.trim()) {
      return res.status(400).json({ error: 'title is required' });
    }

    // Ensure unique invite code
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
        destination: destination?.trim() || 'Tokyo, Japan',
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        inviteCode,
        memberships: {
          create: {
            userId: req.user.id,
            role: 'OWNER',
          },
        },
      },
      include: {
        memberships: {
          include: { user: true },
        },
      },
    });

    res.status(201).json({ trip });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/trips/:code/join
 * Join a trip by invite code. Idempotent — rejoining returns existing membership.
 */
router.post('/:code/join', requireUser, async (req, res, next) => {
  try {
    const { code } = req.params;

    const trip = await prisma.trip.findUnique({
      where: { inviteCode: code.toUpperCase() },
    });
    if (!trip) {
      return res.status(404).json({ error: 'Trip not found — check the invite code' });
    }
    if (trip.status === 'ARCHIVED') {
      return res.status(410).json({ error: 'This trip has ended and is archived' });
    }

    // Upsert membership (idempotent)
    const membership = await prisma.tripMembership.upsert({
      where: {
        userId_tripId: { userId: req.user.id, tripId: trip.id },
      },
      update: {},
      create: {
        userId: req.user.id,
        tripId: trip.id,
        role: 'MEMBER',
      },
    });

    // Notify other members via WebSocket
    const io = req.app.get('io');
    io.to(`trip:${trip.id}`).emit('member-joined', {
      tripId: trip.id,
      user: req.user,
    });

    const fullTrip = await prisma.trip.findUnique({
      where: { id: trip.id },
      include: {
        memberships: { include: { user: true } },
        _count: { select: { entries: true } },
      },
    });

    res.json({ trip: fullTrip, membership });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/trips/:id
 * Get trip details with members.
 */
router.get('/:id', requireUser, async (req, res, next) => {
  try {
    const trip = await prisma.trip.findUnique({
      where: { id: req.params.id },
      include: {
        memberships: { include: { user: true } },
        _count: { select: { entries: true } },
      },
    });
    if (!trip) return res.status(404).json({ error: 'Trip not found' });

    // Verify membership
    const isMember = trip.memberships.some(m => m.userId === req.user.id);
    if (!isMember) return res.status(403).json({ error: 'Not a member of this trip' });

    res.json({ trip });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/trips/:id/feed
 * Paginated feed of entries for a trip, newest first.
 * Query params: cursor (entryId for cursor-based pagination), limit (default 20)
 */
router.get('/:id/feed', requireUser, async (req, res, next) => {
  try {
    const { id } = req.params;
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);
    const cursor = req.query.cursor;

    // Verify membership
    const membership = await prisma.tripMembership.findUnique({
      where: { userId_tripId: { userId: req.user.id, tripId: id } },
    });
    if (!membership) {
      return res.status(403).json({ error: 'Not a member of this trip' });
    }

    const entries = await prisma.entry.findMany({
      where: { tripId: id },
      orderBy: { createdAt: 'desc' },
      take: limit + 1, // fetch one extra to determine if there's a next page
      ...(cursor && {
        cursor: { id: cursor },
        skip: 1,
      }),
      include: {
        user: { select: { id: true, name: true, avatar: true } },
        reactions: {
          include: { user: { select: { id: true, name: true } } },
        },
        comments: {
          include: { user: { select: { id: true, name: true, avatar: true } } },
          orderBy: { createdAt: 'asc' },
          take: 3, // preview only
        },
        _count: { select: { comments: true } },
      },
    });

    const hasMore = entries.length > limit;
    const items = hasMore ? entries.slice(0, limit) : entries;
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    res.json({
      entries: items,
      pagination: { hasMore, nextCursor, limit },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/trips/:id/members
 * List all members of a trip.
 */
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

/**
 * DELETE /api/trips/:id/leave
 * Leave a trip (remove membership)
 */
router.delete('/:id/leave', requireUser, async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // Can't leave if you're the only owner
    const membership = await prisma.tripMembership.findUnique({
      where: { userId_tripId: { userId: req.user.id, tripId: id } },
    });
    
    if (!membership) {
      return res.status(404).json({ error: 'Not a member of this trip' });
    }
    
    if (membership.role === 'OWNER') {
      const otherOwners = await prisma.tripMembership.count({
        where: { tripId: id, role: 'OWNER', userId: { not: req.user.id } },
      });
      if (otherOwners === 0) {
        return res.status(400).json({ error: 'Cannot leave as the only owner. Transfer ownership first.' });
      }
    }
    
    await prisma.tripMembership.delete({
      where: { userId_tripId: { userId: req.user.id, tripId: id } },
    });
    
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
