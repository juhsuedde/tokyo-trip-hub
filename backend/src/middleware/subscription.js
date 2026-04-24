// backend/src/middleware/subscription.js
const { prisma } = require('../lib/prisma');

const TIER_LIMITS = {
  FREE: { maxTrips: 3, exportFormats: ['MARKDOWN'] },
  PREMIUM: { maxTrips: Infinity, exportFormats: ['PDF', 'EPUB', 'MARKDOWN'] },
};

/**
 * enforceTripLimit — check user hasn't exceeded free tier trip limit
 */
async function enforceTripLimit(req, res, next) {
  if (!req.user) {
    return next(); // Let requireAuth handle unauthenticated
  }

  const userId = req.user.id;
  const tier = req.user.tier || 'FREE';

  if (tier === 'PREMIUM') {
    return next();
  }

  try {
    const tripCount = await prisma.trip.count({
      where: {
        memberships: {
          some: { userId },
        },
      },
    });

    if (tripCount >= TIER_LIMITS.FREE.maxTrips) {
      return res.status(403).json({
        error: 'Free tier limit reached',
        message: 'Upgrade to Premium for unlimited trips',
        limit: TIER_LIMITS.FREE.maxTrips,
      });
    }

    next();
  } catch (err) {
    const { logger } = require('../lib/logger');
    logger.error({ err }, '[enforceTripLimit] error');
    next();
  }
}

/**
 * enforceExportFormat — check user can export in requested format
 */
function enforceExportFormat(req, res, next) {
  if (!req.user) {
    req.user = { tier: 'FREE' };
  }

  const tier = req.user.tier || 'FREE';
  const format = req.body?.format || req.query?.format || 'MARKDOWN';
  const allowed = TIER_LIMITS[tier].exportFormats;

  if (!allowed.includes(format)) {
    return res.status(403).json({
      error: 'Format not available on free tier',
      allowed,
      upgrade: 'Upgrade to Premium for PDF/EPUB export',
    });
  }

  next();
}

module.exports = {
  enforceTripLimit,
  enforceExportFormat,
  TIER_LIMITS,
};