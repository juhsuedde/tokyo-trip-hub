import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import type { Request, Response, NextFunction } from 'express';
import type { RequestUser, Tier } from '../types';

interface TierLimits {
  maxTrips: number | null;
  maxEntriesPerTrip: number | typeof Infinity;
  allowedExports: string[];
  unlimitedRetention: boolean;
  customDomain: boolean;
  whiteLabel: boolean;
  apiAccess: boolean;
}

export const TIER_LIMITS: Record<Tier, TierLimits> = {
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

export async function checkTripLimit(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.user) return void res.status(401).json({ error: 'Authentication required' });
  const { id: userId, tier } = req.user;
  const limits = TIER_LIMITS[tier];

  if (limits.maxTrips === null) return next();

  try {
    const count = await prisma.trip.count({
      where: { ownerId: userId, status: 'ACTIVE' },
    });

    if (count >= limits.maxTrips) {
      return void res.status(403).json({
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

export async function checkEntryLimit(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.user) return void res.status(401).json({ error: 'Authentication required' });
  const { tier } = req.user;
  const { id: tripId, tripId: tripIdAlt } = req.params;
  const targetTripId = tripId || tripIdAlt;
  const limits = TIER_LIMITS[tier];

  if (!limits) return next();

  if (limits.maxEntriesPerTrip === Infinity) return next();

  try {
    const count = await prisma.entry.count({ where: { tripId: targetTripId } });

    if (count >= limits.maxEntriesPerTrip) {
      return void res.status(403).json({
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

export function checkExportFormat(req: Request, res: Response, next: NextFunction): void {
  const { tier } = req.user!;
  const format = (req.query.format as string || req.body.format as string || '').toLowerCase();
  const limits = TIER_LIMITS[tier];

  if (!format) {
    return void res.status(400).json({ error: 'Export format is required' });
  }

  if (!limits.allowedExports.includes(format)) {
    return void res.status(403).json({
      error: `Export format '${format}' is not available on the ${tier} plan.`,
      code: 'EXPORT_FORMAT_NOT_ALLOWED',
      allowedFormats: limits.allowedExports,
    });
  }

  next();
}

export function requireTier(minimumTier: Tier) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const tierOrder: Record<Tier, number> = { FREE: 0, PREMIUM: 1, PRO: 2 };
    const userRank = tierOrder[req.user?.tier as Tier] ?? 0;
    const requiredRank = tierOrder[minimumTier] ?? 0;

    if (userRank < requiredRank) {
      return void res.status(403).json({
        error: `This feature requires ${minimumTier} or higher. You are on ${req.user?.tier}.`,
        code: 'TIER_REQUIRED',
        required: minimumTier,
        current: req.user?.tier,
      });
    }

    next();
  };
}

export const enforceExportFormat = checkExportFormat;

export {};