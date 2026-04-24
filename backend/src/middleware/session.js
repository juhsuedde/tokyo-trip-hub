const { prisma } = require('../lib/prisma');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;

/**
 * Reads X-Session-Token from headers.
 * Attaches req.sessionToken — does NOT require it (some routes are public).
 */
function sessionMiddleware(req, res, next) {
  const bearerAuth = req.headers.authorization;
  if (bearerAuth && bearerAuth.startsWith('Bearer ')) {
    req.sessionToken = bearerAuth.slice(7);
  } else {
    req.sessionToken = req.headers['x-session-token'] || null;
  }
  next();
}

/**
 * Requires a valid session token and attaches req.user.
 * Supports both JWT and legacy tempSession tokens.
 * Returns 401 if missing/invalid.
 */
async function requireUser(req, res, next) {
  const bearerAuth = req.headers.authorization;
  const token = bearerAuth && bearerAuth.startsWith('Bearer ')
    ? bearerAuth.slice(7)
    : req.headers['x-session-token'];
    
  if (!token) {
    return res.status(401).json({ error: 'Missing X-Session-Token header' });
  }

  try {
    // Try JWT first
    if (JWT_SECRET) {
      try {
        const payload = jwt.verify(token, JWT_SECRET);
        req.user = {
          id: payload.sub,
          email: payload.email,
          name: payload.name,
          tier: payload.tier || 'FREE',
        };
        return next();
      } catch (jwtErr) {
        // Not a valid JWT, try legacy tempSession
      }
    }
    
    // Fallback: legacy tempSession lookup
    const user = await prisma.user.findUnique({
      where: { tempSession: token },
    });
    if (!user) {
      return res.status(401).json({ error: 'Invalid or expired session token' });
    }
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Like requireUser but attaches user if token present, continues if not.
 */
async function attachUser(req, res, next) {
  const token = req.sessionToken;
  if (!token) return next();

  try {
    // Try JWT first
    if (JWT_SECRET) {
      try {
        const payload = jwt.verify(token, JWT_SECRET);
        req.user = {
          id: payload.sub,
          email: payload.email,
          name: payload.name,
          tier: payload.tier || 'FREE',
        };
        return next();
      } catch (jwtErr) {
        // Not a valid JWT, try legacy tempSession
      }
    }
    
    // Fallback: legacy tempSession lookup
    const user = await prisma.user.findUnique({
      where: { tempSession: token },
    });
    req.user = user || null;
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Alias attachUser as optionalAuth for compatibility
 */
const optionalAuth = attachUser;

module.exports = { sessionMiddleware, optionalAuth, requireUser, attachUser };
