'use strict';

const express = require('express');
const { prisma } = require('../lib/prisma');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);

function requireAdmin(req, res, next) {
  if (!req.user?.isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

router.use(requireAdmin);

// GET /api/admin/stats
router.get('/stats', async (req, res, next) => {
  try {
    const [totalUsers, totalTrips, totalEntries, activeUsers] = await Promise.all([
      prisma.user.count(),
      prisma.trip.count(),
      prisma.entry.count(),
      prisma.user.count({
        where: { updatedAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
      }),
    ]);

    res.json({
      totalUsers,
      totalTrips,
      totalEntries,
      activeUsers,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/users
router.get('/users', async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit || '50', 10);
    const offset = parseInt(req.query.offset || '0', 10);

    const users = await prisma.user.findMany({
      skip: offset,
      take: limit,
      select: {
        id: true,
        email: true,
        name: true,
        tier: true,
        isAdmin: true,
        createdAt: true,
        _count: { select: { memberships: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const total = await prisma.user.count();

    res.json({ users, total, limit, offset });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/users/:id/tier
router.post('/users/:id/tier', async (req, res, next) => {
  try {
    const { tier } = req.body;
    if (!['FREE', 'PREMIUM', 'PRO'].includes(tier)) {
      return res.status(400).json({ error: 'Invalid tier' });
    }

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { tier },
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        action: 'ADMIN_TIER_CHANGE',
        entityType: 'User',
        entityId: user.id,
        metadata: { newTier: tier },
      },
    });

    res.json({ id: user.id, tier: user.tier });
  } catch (err) {
    next(err);
  }
});

module.exports = router;