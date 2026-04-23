// backend/src/middleware/auth.js
const jwt = require('jsonwebtoken');
const { prisma } = require('../lib/prisma');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.warn('JWT_SECRET env var not set - auth will not work');
}

function extractToken(req) {
  // Try Bearer token first
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) {
    return auth.slice(7);
  }
  // Try cookie
  if (req.cookies && req.cookies.token) {
    return req.cookies.token;
  }
  return null;
}

/**
 * requireAuth — hard gate, returns 401 if no valid token.
 * Attaches req.user = { id, email, name, tier }
 */
async function requireAuth(req, res, next) {
  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);

    // Attach user object from JWT claims
    req.user = {
      id: payload.sub,
      email: payload.email,
      name: payload.name,
      tier: payload.tier || 'FREE',
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
 * optionalAuth — soft gate, populates req.user if token present but never rejects.
 */
async function optionalAuth(req, res, next) {
  const token = extractToken(req);
  if (!token) {
    return next();
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = {
      id: payload.sub,
      email: payload.email,
      name: payload.name,
      tier: payload.tier || 'FREE',
    };
  } catch (err) {
    // Invalid token - treat as unauthenticated, don't reject
  }
  next();
}

/**
 * requireTripRole(role) — check user has required role for trip
 */
function requireTripRole(requiredRole) {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { tripId } = req.params;
    if (!tripId) {
      return res.status(400).json({ error: 'Trip ID required' });
    }

    try {
      const membership = await prisma.tripMembership.findUnique({
        where: {
          userId_tripId: {
            userId: req.user.id,
            tripId,
          },
        },
      });

      if (!membership) {
        return res.status(403).json({ error: 'Not a member of this trip' });
      }

      const roleHierarchy = { VIEWER: 0, EDITOR: 1, OWNER: 2 };
      if (roleHierarchy[membership.role] < roleHierarchy[requiredRole]) {
        return res.status(403).json({ error: `Requires ${requiredRole} role` });
      }

      next();
    } catch (err) {
      console.error('[requireTripRole]', err);
      res.status(500).json({ error: 'Internal error' });
    }
  };
}

/**
 * signToken — create JWT for user
 */
function signToken(user) {
  const payload = {
    sub: user.id,
    email: user.email,
    name: user.name,
    tier: user.tier || 'FREE',
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

module.exports = {
  requireAuth,
  optionalAuth,
  requireTripRole,
  signToken,
  extractToken,
};