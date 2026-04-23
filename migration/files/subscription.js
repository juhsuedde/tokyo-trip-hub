// backend/src/middleware/subscription.js
// Enforces Free tier limits before mutating operations.
// Must be used after requireAuth.

import { prisma } from '../lib/prisma.js';

export const TIER_LIMITS = {
  FREE: {
    maxTrips: 3,
    exportFormats: ['markdown'],
    aiPriority: 'normal',
  },
  PREMIUM: {
    maxTrips: Infinity,
    exportFormats: ['markdown', 'pdf', 'epub'],
    aiPriority: 'high',
  },
};

/**
 * Middleware: blocks trip creation if user is on FREE and already has 3 trips.
 */
export async function enforceTripLimit(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });
  if (req.user.tier === 'PREMIUM') return next();

  const count = await prisma.tripMembership.count({
    where: { userId: req.user.id },
  });

  const limit = TIER_LIMITS.FREE.maxTrips;
  if (count >= limit) {
    return res.status(403).json({
      error: `Free tier allows up to ${limit} trips. Upgrade to Premium for unlimited trips.`,
      code: 'TRIP_LIMIT_REACHED',
      currentCount: count,
      limit,
    });
  }
  next();
}

/**
 * Middleware factory: blocks export if the requested format isn't allowed.
 * Usage: router.post('/export', requireAuth, enforceExportFormat)
 */
export function enforceExportFormat(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });

  const format = (req.body.format ?? req.query.format ?? '').toLowerCase();
  const allowed = TIER_LIMITS[req.user.tier]?.exportFormats ?? TIER_LIMITS.FREE.exportFormats;

  if (format && !allowed.includes(format)) {
    return res.status(403).json({
      error: `Export format "${format}" requires a Premium subscription.`,
      code: 'EXPORT_FORMAT_RESTRICTED',
      allowedFormats: allowed,
    });
  }
  next();
}
