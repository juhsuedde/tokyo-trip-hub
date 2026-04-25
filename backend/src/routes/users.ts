import type { Request, Response } from 'express';

const router = require('express').Router();
const { prisma } = require('../lib/prisma');
const { requireUser } = require('../middleware/session');

// GET /api/users/me
router.get('/me', requireUser, async (req: Request, res: Response) => {
  res.json({ user: req.user });
});

module.exports = router;
