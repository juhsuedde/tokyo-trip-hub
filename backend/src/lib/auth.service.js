'use strict';

const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { prisma } = require('./prisma');
const { logger } = require('./logger');
const { sendEmail } = require('./email.service');

const sha256 = (raw) => crypto.createHash('sha256').update(raw).digest('hex');

const JWT_SECRET = process.env.JWT_SECRET;
const ACCESS_EXPIRY = process.env.JWT_ACCESS_EXPIRY || '15m';
const REFRESH_EXPIRY_DAYS = parseInt(process.env.JWT_REFRESH_EXPIRY || '30', 10);

function issueAccessToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, tier: user.tier || 'FREE', isAdmin: user.isAdmin || false },
    JWT_SECRET,
    { expiresIn: ACCESS_EXPIRY }
  );
}

async function issueRefreshToken(userId, familyId) {
  const rawToken = crypto.randomBytes(64).toString('hex');
  const tokenHash = sha256(rawToken);
  const family = familyId || crypto.randomUUID();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + REFRESH_EXPIRY_DAYS);

  await prisma.refreshToken.create({
    data: { tokenHash, userId, family, expiresAt },
  });

  return rawToken;
}

async function rotateRefreshToken(rawToken) {
  const tokenHash = sha256(rawToken);
  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!stored) {
    throw Object.assign(new Error('Refresh token not found'), { status: 401 });
  }

  if (stored.usedAt || stored.revokedAt) {
    logger.warn({ family: stored.family, userId: stored.userId }, 'Refresh token reuse detected - revoking family');
    await prisma.refreshToken.updateMany({
      where: { family: stored.family, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    throw Object.assign(new Error('Refresh token already used. Please log in again.'), { status: 401 });
  }

  if (stored.expiresAt < new Date()) {
    throw Object.assign(new Error('Refresh token expired'), { status: 401 });
  }

  const [, newRawToken] = await prisma.$transaction(async (tx) => {
    await tx.refreshToken.update({
      where: { id: stored.id },
      data: { usedAt: new Date() },
    });
    const newToken = await issueRefreshToken(stored.userId, stored.family);
    return [null, newToken];
  });

  const { user } = stored;
  const accessToken = issueAccessToken(user);

  return {
    accessToken,
    refreshToken: newRawToken,
    user: { id: user.id, email: user.email, name: user.name, tier: user.tier, isAdmin: user.isAdmin },
  };
}

async function revokeAllRefreshTokens(userId) {
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

const RESET_EXPIRY_HOURS = 2;

async function requestPasswordReset(email) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    logger.info({ email }, 'Password reset requested for unknown email');
    return;
  }

  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = sha256(rawToken);
  const expiry = new Date();
  expiry.setHours(expiry.getHours() + RESET_EXPIRY_HOURS);

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordResetTokenHash: tokenHash, passwordResetExpiry: expiry },
  });

  const resetUrl = `${process.env.APP_BASE_URL || 'http://localhost:5173'}/reset-password?token=${rawToken}`;
  await sendEmail({
    to: email,
    subject: 'TokyoTrip Hub - Reset your password',
    text: `Hi ${user.name},\n\nClick the link below to reset your password. It expires in ${RESET_EXPIRY_HOURS} hours.\n\n${resetUrl}\n\nIf you didn't request this, ignore this email.`,
    html: `<p>Hi ${user.name},</p><p>Click <a href="${resetUrl}">here</a> to reset your password. Expires in ${RESET_EXPIRY_HOURS} hours.</p>`,
  });
}

async function resetPassword(rawToken, newPassword) {
  const tokenHash = sha256(rawToken);
  const user = await prisma.user.findFirst({
    where: {
      passwordResetTokenHash: tokenHash,
      passwordResetExpiry: { gt: new Date() },
    },
  });

  if (!user) {
    throw Object.assign(new Error('Invalid or expired password reset token'), { status: 400 });
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: { passwordHash, passwordResetTokenHash: null, passwordResetExpiry: null },
    });
    await tx.refreshToken.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  });
}

module.exports = {
  issueAccessToken,
  issueRefreshToken,
  rotateRefreshToken,
  revokeAllRefreshTokens,
  requestPasswordReset,
  resetPassword,
};