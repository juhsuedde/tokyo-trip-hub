const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const { prisma } = require('../lib/prisma');
const { requireUser } = require('../middleware/session');

/**
 * POST /api/users/register
 * Create or retrieve a user by session token.
 * Body: { name: string }
 * Header: X-Session-Token (if exists, returns existing user; if not, creates with new token)
 */
router.post('/register', async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'name is required' });
    }

    const existingToken = req.sessionToken;

    // If token provided, try to find existing user
    if (existingToken) {
      const existing = await prisma.user.findUnique({
        where: { tempSession: existingToken },
      });
      if (existing) {
        return res.json({ user: existing, sessionToken: existingToken });
      }
    }

    // Create new user with fresh session token
    const sessionToken = uuidv4();
    const user = await prisma.user.create({
      data: {
        name: name.trim(),
        tempSession: sessionToken,
      },
    });

    res.status(201).json({ user, sessionToken });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/users/me
 * Returns the current user based on session token.
 */
router.get('/me', requireUser, async (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
