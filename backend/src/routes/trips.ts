const router = require('express').Router();
const { prisma } = require('../lib/prisma');
const { requireUser } = require('../middleware/session');
const { CreateTripSchema, UpdateTripSchema, PublishTripSchema, validateAsync } = require('../lib/validation');
const { sanitizeHtml } = require('../lib/sanitizer');
const { checkTripLimit, requireTier } = require('../middleware/subscription');

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
  const { title, destination, startDate, endDate } = req.validated;
  const data = {
    title: sanitizeHtml(title.trim()),
    destination: sanitizeHtml(destination) || 'Tokyo, Japan',
    ownerId: req.user.id,
    startDate: startDate && startDate.trim() ? new Date(startDate) : null,
    endDate: endDate && endDate.trim() ? new Date(endDate) : null,
    memberships: { create: { userId: req.user.id, role: 'OWNER' } },
  };

  const MAX_ATTEMPTS = 3;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const trip = await prisma.trip.create({ data: { ...data, inviteCode: generateInviteCode() } });
      return res.status(201).json({ trip, membership: { role: 'OWNER' } });
    } catch (err) {
      if (err.code === 'P2002' && attempt < MAX_ATTEMPTS - 1) continue;
      if (err.code === 'P2002') {
        return res.status(503).json({ error: 'Could not generate a unique invite code. Please try again.' });
      }
      return next(err);
    }
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
      where: { tripId: req.params.id, deletedAt: null },
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

// PATCH /api/trips/:id/members/:userId
router.patch('/:id/members/:userId', requireUser, async (req, res, next) => {
  try {
    const { id: tripId, userId: targetUserId } = req.params;

    const callerMembership = await prisma.tripMembership.findUnique({
      where: { userId_tripId: { userId: req.user.id, tripId } },
    });
    if (!callerMembership || callerMembership.role !== 'OWNER') {
      return res.status(403).json({ error: 'Only owners can change member roles' });
    }

    const { role } = req.body;
    if (!role || !['OWNER', 'MEMBER'].includes(role)) {
      return res.status(400).json({ error: 'Role must be OWNER or MEMBER' });
    }

    const targetMembership = await prisma.tripMembership.findUnique({
      where: { userId_tripId: { userId: targetUserId, tripId } },
    });
    if (!targetMembership) {
      return res.status(404).json({ error: 'User is not a member of this trip' });
    }

    const updated = await prisma.tripMembership.update({
      where: { id: targetMembership.id },
      data: { role },
      include: { user: { select: { id: true, name: true, email: true, avatar: true } } },
    });

    res.json({ membership: updated });
  } catch (err) {
    next(err);
  }
});

// POST /api/trips/:id/transfer-ownership
router.post('/:id/transfer-ownership', requireUser, async (req, res, next) => {
  try {
    const { id: tripId } = req.params;
    const { newOwnerId } = req.body;
    if (!newOwnerId) {
      return res.status(400).json({ error: 'newOwnerId is required' });
    }

    const callerMembership = await prisma.tripMembership.findUnique({
      where: { userId_tripId: { userId: req.user.id, tripId } },
    });
    if (!callerMembership || callerMembership.role !== 'OWNER') {
      return res.status(403).json({ error: 'Only the current owner can transfer ownership' });
    }

    const targetMembership = await prisma.tripMembership.findUnique({
      where: { userId_tripId: { userId: newOwnerId, tripId } },
    });
    if (!targetMembership) {
      return res.status(404).json({ error: 'Target user is not a member of this trip' });
    }

    await prisma.$transaction([
      prisma.tripMembership.update({
        where: { id: callerMembership.id },
        data: { role: 'MEMBER' },
      }),
      prisma.tripMembership.update({
        where: { id: targetMembership.id },
        data: { role: 'OWNER' },
      }),
      prisma.trip.update({
        where: { id: tripId },
        data: { ownerId: newOwnerId },
      }),
    ]);

    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
      include: { memberships: { include: { user: { select: { id: true, name: true, avatar: true } } } } },
    });

    res.json({ trip });
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

// PATCH /api/trips/:id
router.patch('/:id', requireUser, validateAsync(UpdateTripSchema), async (req, res, next) => {
  try {
    const { id } = req.params;

    const membership = await prisma.tripMembership.findUnique({
      where: { userId_tripId: { userId: req.user.id, tripId: id } },
    });
    if (!membership || membership.role !== 'OWNER') {
      return res.status(403).json({ error: 'Only owners can update trips' });
    }

    const { title, destination, startDate, endDate, status } = req.validated as { title?: string; destination?: string; startDate?: string; endDate?: string; status?: 'ACTIVE' | 'ENDED' | 'ARCHIVED' };
    const data: { title?: string; destination?: string; startDate?: Date | null; endDate?: Date | null; status?: 'ACTIVE' | 'ENDED' | 'ARCHIVED' } = {};
    if (title !== undefined) data.title = sanitizeHtml(title.trim());
    if (destination !== undefined) data.destination = sanitizeHtml(destination);
    if (startDate !== undefined) data.startDate = startDate ? new Date(startDate) : null;
    if (endDate !== undefined) data.endDate = endDate ? new Date(endDate) : null;
    if (status !== undefined) data.status = status;

    const trip = await prisma.trip.update({
      where: { id },
      data,
      include: { memberships: { include: { user: true } }, _count: { select: { entries: true } } },
    });

    res.json({ trip });
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

// POST /api/trips/:id/publish
router.post('/:id/publish', requireUser, requireTier('PREMIUM'), validateAsync(PublishTripSchema), async (req, res, next) => {
  try {
    const { id } = req.params;

    const membership = await prisma.tripMembership.findUnique({
      where: { userId_tripId: { userId: req.user.id, tripId: id } },
    });
    if (!membership || membership.role !== 'OWNER') {
      return res.status(403).json({ error: 'Only owners can publish trips' });
    }

    const { slug, customDomain } = req.validated as { slug?: string; customDomain?: string | null };
    const data: { isPublished: boolean; publishedSlug?: string; publishedUrl?: string; customDomain?: string | null } = { isPublished: true };
    if (slug) data.publishedSlug = slug;
    else if (!slug) data.publishedSlug = id.slice(0, 8);
    data.publishedUrl = `${process.env.APP_BASE_URL || 'http://localhost:5173'}/p/${data.publishedSlug}`;
    if (customDomain !== undefined) data.customDomain = customDomain;

    const trip = await prisma.trip.update({
      where: { id },
      data,
    });

    res.json({ id: trip.id, isPublished: trip.isPublished, publishedSlug: trip.publishedSlug, publishedUrl: trip.publishedUrl, customDomain: trip.customDomain });
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'This slug or custom domain is already taken' });
    }
    next(err);
  }
});

// POST /api/trips/:id/unpublish
router.post('/:id/unpublish', requireUser, async (req, res, next) => {
  try {
    const { id } = req.params;

    const membership = await prisma.tripMembership.findUnique({
      where: { userId_tripId: { userId: req.user.id, tripId: id } },
    });
    if (!membership || membership.role !== 'OWNER') {
      return res.status(403).json({ error: 'Only owners can unpublish trips' });
    }

    const trip = await prisma.trip.update({
      where: { id },
      data: { isPublished: false, publishedSlug: null, publishedUrl: null, customDomain: null },
    });

    res.json({ id: trip.id, isPublished: trip.isPublished });
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