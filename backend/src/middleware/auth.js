// backend/src/middleware/auth.js
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma.js';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error('JWT_SECRET env var is required');

/**
 * requireAuth — hard gate, returns 401 if no valid token.
 * Attaches req.user = { id, email, name, tier }
 */
export async function requireAuth(req, res, next) {
  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);

    // Check Redis token blacklist (for logout)
    const { redis } = await import('../lib/redis.js');
    const blacklisted = await redis.get(`blacklist:${token}`);
    if (blacklisted) {
      return res.status(401).json({ error: 'Token has been revoked' });
    }

    // Attach lean user object — avoid DB round-trip on every request
    // by trusting short-lived JWT claims. Tier is refreshed on login.
    req.user = {
      id: payload.sub,
      email: payload.email,
      name: payload.name,
      tier: payload.tier ?? 'FREE',
    };

    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
}

/**
 * optionalAuth — soft gate, populates req.user if token present but
 * never rejects. Used for endpoints that serve both anon and authed users.
 */
export async function optionalAuth(req, res, next) {
  const token = extractToken(req);
  if (!token) return next();

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = {
      id: payload.sub,
      email: payload.email,
      name: payload.name,
      tier: payload.tier ?? 'FREE',
    };
  } catch {
    // Ignore invalid/expired tokens in optional mode
  }
  next();
}

/**
 * requireTier('PREMIUM') — must be used after requireAuth.
 * Returns 403 if the user's subscription tier doesn't match.
 */
export function requireTier(minTier) {
  const TIER_RANK = { FREE: 0, PREMIUM: 1 };
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    const userRank = TIER_RANK[req.user.tier] ?? 0;
    const requiredRank = TIER_RANK[minTier] ?? 0;
    if (userRank < requiredRank) {
      return res.status(403).json({
        error: 'Subscription upgrade required',
        requiredTier: minTier,
        currentTier: req.user.tier,
      });
    }
    next();
  };
}

/**
 * requireTripRole('OWNER' | 'EDITOR' | 'VIEWER')
 * Must be used after requireAuth. Checks the user's role in req.params.tripId.
 */
export function requireTripRole(minRole) {
  const ROLE_RANK = { VIEWER: 0, EDITOR: 1, OWNER: 2 };
  return async (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    const tripId = req.params.tripId ?? req.params.id;
    if (!tripId) return res.status(400).json({ error: 'Trip ID required' });

    const membership = await prisma.tripMembership.findUnique({
      where: { userId_tripId: { userId: req.user.id, tripId } },
    });

    if (!membership) {
      return res.status(403).json({ error: 'Not a member of this trip' });
    }

    const userRoleRank = ROLE_RANK[membership.role] ?? 0;
    const requiredRoleRank = ROLE_RANK[minRole] ?? 0;
    if (userRoleRank < requiredRoleRank) {
      return res.status(403).json({ error: `Requires ${minRole} role or higher` });
    }

    req.membership = membership;
    next();
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function extractToken(req) {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }
  // Also support httpOnly cookie for browser sessions
  return req.cookies?.token ?? null;
}

export function signToken(user, tier = 'FREE') {
  return jwt.sign(
    { sub: user.id, email: user.email, name: user.name, tier },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}
