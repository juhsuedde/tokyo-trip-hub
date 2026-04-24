'use strict';

const { prisma } = require('../lib/prisma');
const { logger } = require('../lib/logger');

const TIER_LIMITS = {
  FREE: {
    maxTrips: 3,
    maxEntriesPerTrip: 50,
    allowedExports: ['markdown'],
    unlimitedRetention: false,
    customDomain: false,
    whiteLabel: false,
    apiAccess: false,
  },
  PREMIUM: {
    maxTrips: null,
    maxEntriesPerTrip: 500,
    allowedExports: ['markdown', 'pdf', 'epub'],
    unlimitedRetention: true,
    customDomain: false,
    whiteLabel: false,
    apiAccess: false,
  },
  PRO: {
    maxTrips: null,
    maxEntriesPerTrip: Infinity,
    allowedExports: ['markdown', 'pdf', 'epub'],
    unlimitedRetention: true,
    customDomain: true,
    whiteLabel: true,
    apiAccess: true,
  },
};

async function checkTripLimit(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });
  const { id: userId, tier } = req.user;
  const limits = TIER_LIMITS[tier];

  if (limits.maxTrips === null) return next();

  try {
    const count = await prisma.trip.count({
      where: { ownerId: userId, status: 'ACTIVE' },
    });

    if (count >= limits.maxTrips) {
      return res.status(403).json({
        error: `Trip limit reached for ${tier} tier (${limits.maxTrips} active trips).`,
        code: 'TRIP_LIMIT_REACHED',
        limit: limits.maxTrips,
        current: count,
      });
    }

    next();
  } catch (err) {
    logger.error({ err }, 'checkTripLimit error');
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function checkEntryLimit(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });
  const { tier } = req.user;
  const { id: tripId, tripId: tripIdAlt } = req.params;
  const targetTripId = tripId || tripIdAlt;
  const limits = TIER_LIMITS[tier];

  if (!limits) return next();

  if (limits.maxEntriesPerTrip === Infinity) return next();

  try {
    const count = await prisma.entry.count({ where: { tripId: targetTripId } });

    if (count >= limits.maxEntriesPerTrip) {
      return res.status(403).json({
        error: `Entry limit reached for ${tier} tier (${limits.maxEntriesPerTrip} entries/trip).`,
        code: 'ENTRY_LIMIT_REACHED',
        limit: limits.maxEntriesPerTrip,
        current: count,
      });
    }

    next();
  } catch (err) {
    logger.error({ err }, 'checkEntryLimit error');
    res.status(500).json({ error: 'Internal server error' });
  }
}

function checkExportFormat(req, res, next) {
  const { tier } = req.user;
  const format = (req.query.format || req.body.format || '').toLowerCase();
  const limits = TIER_LIMITS[tier];

  if (!format) {
    return res.status(400).json({ error: 'Export format is required' });
  }

  if (!limits.allowedExports.includes(format)) {
    return res.status(403).json({
      error: `Export format '${format}' is not available on the ${tier} plan.`,
      code: 'EXPORT_FORMAT_NOT_ALLOWED',
      allowedFormats: limits.allowedExports,
    });
  }

  next();
}

function requireTier(minimumTier) {
  const tierOrder = { FREE: 0, PREMIUM: 1, PRO: 2 };
  return (req, res, next) => {
    const userRank = tierOrder[req.user.tier] ?? 0;
    const requiredRank = tierOrder[minimumTier] ?? 0;

    if (userRank < requiredRank) {
      return res.status(403).json({
        error: `This feature requires ${minimumTier} or higher. You are on ${req.user.tier}.`,
        code: 'TIER_REQUIRED',
        required: minimumTier,
        current: req.user.tier,
      });
    }

    next();
  };
}

module.exports = {
  TIER_LIMITS,
  checkTripLimit,
  checkEntryLimit,
  checkExportFormat,
  enforceExportFormat: checkExportFormat,
  requireTier,
};