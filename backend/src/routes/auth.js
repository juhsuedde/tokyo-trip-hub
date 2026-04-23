// backend/src/routes/auth.js
import { Router } from 'express';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, signToken } from '../middleware/auth.js';
import { redis } from '../lib/redis.js';
import { uploadAvatar } from '../lib/upload.js';

const router = Router();
const BCRYPT_ROUNDS = 12;

// ── Validation schemas ────────────────────────────────────────────────────────

const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(1, 'Name is required').max(80),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// ── POST /auth/register ───────────────────────────────────────────────────────

router.post('/register', async (req, res) => {
  const result = registerSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(422).json({ error: result.error.errors[0].message });
  }

  const { email, password, name } = result.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return res.status(409).json({ error: 'An account with this email already exists' });
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      name,
      subscription: {
        create: { tier: 'FREE', status: 'ACTIVE' },
      },
    },
    include: { subscription: true },
  });

  const token = signToken(user, user.subscription?.tier ?? 'FREE');

  res.status(201).json({
    token,
    user: safeUser(user),
  });
});

// ── POST /auth/login ──────────────────────────────────────────────────────────

router.post('/login', async (req, res) => {
  const result = loginSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(422).json({ error: 'Invalid email or password' });
  }

  const { email, password } = result.data;

  const user = await prisma.user.findUnique({
    where: { email },
    include: { subscription: true },
  });

  // Use constant-time compare even on "not found" to prevent user enumeration
  const dummyHash = '$2b$12$invalidhashfortimingattempts';
  const hash = user?.passwordHash ?? dummyHash;
  const match = await bcrypt.compare(password, hash);

  if (!user || !match) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const tier = user.subscription?.tier ?? 'FREE';
  const token = signToken(user, tier);

  res.json({
    token,
    user: safeUser(user),
  });
});

// ── POST /auth/logout ─────────────────────────────────────────────────────────

router.post('/logout', requireAuth, async (req, res) => {
  const token = req.headers.authorization?.slice(7);
  if (token) {
    // Blacklist token for 7 days (matching JWT expiry)
    await redis.set(`blacklist:${token}`, '1', 'EX', 60 * 60 * 24 * 7);
  }
  res.json({ ok: true });
});

// ── GET /auth/me ──────────────────────────────────────────────────────────────

router.get('/me', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    include: { subscription: true },
  });

  if (!user) return res.status(404).json({ error: 'User not found' });

  res.json({ user: safeUser(user) });
});

// ── PUT /auth/profile ─────────────────────────────────────────────────────────

const profileSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  preferences: z.record(z.unknown()).optional(),
});

router.put('/profile', requireAuth, uploadAvatar.single('avatar'), async (req, res) => {
  const result = profileSchema.safeParse(
    typeof req.body.data === 'string' ? JSON.parse(req.body.data) : req.body
  );
  if (!result.success) {
    return res.status(422).json({ error: result.error.errors[0].message });
  }

  const updateData = { ...result.data };

  if (req.file) {
    // uploadAvatar middleware sets req.file.location (S3/Cloudinary) or req.file.path (local)
    updateData.avatarUrl = req.file.location ?? `/uploads/avatars/${req.file.filename}`;
  }

  const user = await prisma.user.update({
    where: { id: req.user.id },
    data: updateData,
    include: { subscription: true },
  });

  res.json({ user: safeUser(user) });
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function safeUser(user) {
  const { passwordHash, ...safe } = user;
  return safe;
}

export default router;
