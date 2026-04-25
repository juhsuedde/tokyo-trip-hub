// backend/src/routes/auth.js
const express = require('express');
const bcrypt = require('bcrypt');
const { prisma } = require('../lib/prisma');
const { logger } = require('../lib/logger');
const { requireAuth, signToken } = require('../middleware/auth');
const { LoginSchema, RegisterSchema, UpdateProfileSchema, validateAsync } = require('../lib/validation');
const { issueAccessToken, issueRefreshToken, rotateRefreshToken, revokeAllRefreshTokens, requestPasswordReset, resetPassword } = require('../lib/auth.service');

const router = express.Router();

const setRefreshCookie = (res, token) => {
  res.cookie('refreshToken', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 30 * 24 * 60 * 60 * 1000,
    path: '/api/auth',
  });
};

// ── POST /api/auth/register ───────────────────────────────────────────
router.post('/register', validateAsync(RegisterSchema), async (req, res, next) => {
  try {
    const { email, password, name } = req.validated;

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        name: name.trim(),
        email: email.toLowerCase().trim(),
        passwordHash,
      },
    });

    const accessToken = issueAccessToken(user);
    const refreshToken = await issueRefreshToken(user.id);
    setRefreshCookie(res, refreshToken);

    res.status(201).json({
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        tier: user.tier,
        isAdmin: user.isAdmin,
      },
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

    const accessToken = issueAccessToken(user);
    const refreshToken = await issueRefreshToken(user.id);
    setRefreshCookie(res, refreshToken);

    res.json({
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        tier: user.tier,
        isAdmin: user.isAdmin,
      },
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
router.put('/profile', requireAuth, validateAsync(UpdateProfileSchema), async (req, res, next) => {
  try {
    const { name, avatar, email, password } = req.validated;

    const updateData = {};
    if (name) updateData.name = name.trim();
    if (avatar !== undefined) updateData.avatar = avatar;
    if (email) updateData.email = email.toLowerCase().trim();
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
  try {
    await revokeAllRefreshTokens(req.user.id);
    res.clearCookie('refreshToken', { path: '/api/auth' });
    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/auth/refresh ──────────────────────────────────────────────
router.post('/refresh', async (req, res) => {
  const rawToken = req.cookies?.refreshToken || req.body?.refreshToken;
  if (!rawToken) {
    return res.status(401).json({ error: 'No refresh token provided' });
  }

  try {
    const result = await rotateRefreshToken(rawToken);
    setRefreshCookie(res, result.refreshToken);
    res.json(result);
  } catch (err) {
    res.clearCookie('refreshToken', { path: '/api/auth' });
    const status = err.status || 401;
    res.status(status).json({ error: err.message });
  }
});

// ── POST /api/auth/forgot-password ───────────────────────────────────────
router.post('/forgot-password', validateAsync(ForgotPasswordSchema), async (req, res) => {
  const { email } = req.validated;

  await requestPasswordReset(email).catch((err) => logger.error({ err }, 'Password reset error'));
  res.json({ message: 'If that email is registered, a reset link has been sent.' });
});

// ── POST /api/auth/reset-password ────────────────────────────────────────
router.post('/reset-password', validateAsync(ResetPasswordSchema), async (req, res) => {
  const { token, password } = req.validated;

  try {
    await resetPassword(token, password);
    res.json({ message: 'Password reset successfully. Please log in.' });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ error: err.message });
  }
});

// ── POST /api/auth/upgrade ───────────────────────────────────────────
// DEV ONLY: This endpoint allows free self-upgrade. In production, integrate with payment provider.
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

    // Issue short-lived access token via proper auth service
    const accessToken = issueAccessToken({
      ...user,
      tier: 'PREMIUM',
    });

    res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        tier: 'PREMIUM',
      },
      accessToken,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
