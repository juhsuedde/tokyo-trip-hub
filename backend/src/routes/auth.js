// backend/src/routes/auth.js
const express = require('express');
const bcrypt = require('bcrypt');
const { prisma } = require('../lib/prisma');
const { requireAuth, signToken } = require('../middleware/auth');

const router = express.Router();

// ── Helpers ───────────────────────────────────────────────────────────
function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ── POST /api/auth/register ───────────────────────────────────────────
router.post('/register', async (req, res, next) => {
  try {
    const { email, password, name } = req.body;

    // Validation
    if (!name?.trim()) {
      return res.status(400).json({ error: 'name is required' });
    }
    if (password && password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Hash password if provided
    let passwordHash = null;
    if (password) {
      passwordHash = await bcrypt.hash(password, 12);
    }

    // Create temp session token
    const tempSession = require('crypto').randomUUID();
    
    const user = await prisma.user.create({
      data: {
        name: name.trim(),
        tempSession,
        email: email?.trim() || null,
        passwordHash,
      },
    });

    const token = tempSession;

    res.status(201).json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
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
router.post('/login', async (req, res, next) => {
  try {
    const { email, password, name } = req.body;

    if (!email && !name) {
      return res.status(400).json({ error: 'email or name required' });
    }
    if (!password) {
      return res.status(400).json({ error: 'password required' });
    }

    // Find user by email or name
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: email || undefined },
          { name: name || undefined }
        ].filter(c => c.email || c.name)
      }
    });

    if (!user || !user.passwordHash) {
      // Timing-safe compare
      await bcrypt.hash(password, 1);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = user.tempSession || require('crypto').randomUUID();

    res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
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
      id: user.id,
      email: user.email,
      name: user.name,
      avatar: user.avatar,
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

module.exports = router;
