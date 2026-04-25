import type { Request, Response } from 'express';
import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireUser } from '../middleware/session';

const router = Router();

// GET /api/users/me
router.get('/me', requireUser, async (req: Request, res: Response) => {
  res.json({ user: req.user });
});

export default router;
