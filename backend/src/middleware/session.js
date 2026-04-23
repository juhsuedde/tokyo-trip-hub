const { prisma } = require('../lib/prisma');

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
 * Returns 401 if missing/invalid.
 */
async function requireUser(req, res, next) {
  const token = req.headers['x-session-token'] || 
                (req.headers.authorization && req.headers.authorization.startsWith('Bearer ') 
                  ? req.headers.authorization.slice(7) : null);
  if (!token) {
    return res.status(401).json({ error: 'Missing X-Session-Token header' });
  }

  try {
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
    const user = await prisma.user.findUnique({
      where: { tempSession: token },
    });
    req.user = user || null;
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { sessionMiddleware, requireUser, attachUser };
