const router = require('express').Router();
const { prisma } = require('../lib/prisma');
const { requireUser } = require('../middleware/session');

/**
 * GET /api/users/me
 * Returns the current user based on session token.
 */
router.get('/me', requireUser, async (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
