// backend/src/routes/auth.js
const express = require('express');
const bcrypt = require('bcrypt');
const { prisma } = require('../lib/prisma');
const { requireAuth, signToken } = require('../middleware/auth');
const { LoginSchema, RegisterSchema, validateAsync } = require('../lib/validation');

const router = express.Router();

// ── POST /api/auth/register ───────────────────────────────────────────
router.post('/register', validateAsync(RegisterSchema), async (req, res, next) => {
  try {
    const { email, password, name } = req.validated;
      return res.status(400).json({ error: 'name is required' });
    }
    if (!email?.trim()) {
      return res.status(400).json({ error: 'email is required' });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        name: name.trim(),
        email: email.toLowerCase().trim(),
        passwordHash,
      },
    });

    const token = signToken(user);

    res.status(201).json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        tier: user.tier,
      },
      token,
    });
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'User already exists' });
    }
    next(err);
  }
});

// ── POST /api/auth/login ────────────────────────────────────────────────
router.post('/login', validateAsync(LoginSchema), async (req, res, next) => {
  try {
    const { email, password } = req.validated;

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (!user || !user.passwordHash) {
      await bcrypt.hash(password, 1);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = signToken(user);

    res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        tier: user.tier,
      },
      token,
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/auth/me ────────────────────────────────────────────────
router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatar: user.avatar,
        tier: user.tier,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ── PUT /api/auth/profile ───────────────────────────────────────────
router.put('/profile', requireAuth, async (req, res, next) => {
  try {
    const { name, avatar, email, password } = req.body;

    const updateData = {};
    if (name) updateData.name = name;
    if (avatar !== undefined) updateData.avatar = avatar;
    if (email) updateData.email = email;
    if (password) {
      updateData.passwordHash = await bcrypt.hash(password, 12);
    }

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: updateData,
    });

    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      avatar: user.avatar,
    });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/auth/logout ──────────────────────────────────────────────
router.post('/logout', requireAuth, async (req, res, next) => {
  res.json({ ok: true });
});

// ── POST /api/auth/upgrade ───────────────────────────────────────────
router.post('/upgrade', requireAuth, async (req, res, next) => {
  try {
    const { tier } = req.body;
    if (tier !== 'PREMIUM') {
      return res.status(400).json({ error: 'Invalid tier' });
    }

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: { tier: 'PREMIUM' },
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        action: 'UPGRADE_TIER',
        entityType: 'User',
        entityId: user.id,
        metadata: { tier: 'PREMIUM' },
      },
    });

    const token = signToken({
      ...req.user,
      tier: 'PREMIUM',
    });

    res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        tier: 'PREMIUM',
      },
      token,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
