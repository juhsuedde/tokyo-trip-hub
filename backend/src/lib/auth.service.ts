import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { prisma } from './prisma';
import { logger } from './logger';
import { sendEmail } from './email.service';
import type { RequestUser } from '../types';

const sha256 = (raw: string): string => crypto.createHash('sha256').update(raw).digest('hex');

const JWT_SECRET = process.env.JWT_SECRET ?? '';
const ACCESS_EXPIRY = process.env.JWT_ACCESS_EXPIRY || '15m';
const REFRESH_EXPIRY_DAYS = parseInt(process.env.JWT_REFRESH_EXPIRY || '30', 10);

export function issueAccessToken(user: Partial<RequestUser>): string {
  return jwt.sign(
    { sub: user.id, email: user.email, tier: user.tier || 'FREE', isAdmin: user.isAdmin || false },
    JWT_SECRET,
    { expiresIn: ACCESS_EXPIRY } as jwt.SignOptions
  );
}

export async function issueRefreshToken(userId: string, familyId?: string): Promise<string> {
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

export async function rotateRefreshToken(rawToken: string): Promise<{ userId: string; refreshToken: string; family: string }> {
  const tokenHash = sha256(rawToken);

  const result = await prisma.$transaction(async (tx) => {
    // Acquire a row-level lock to prevent concurrent rotation of the same token
    const [locked] = await tx.$queryRaw<Array<{
      id: string;
      tokenHash: string;
      userId: string;
      family: string;
      expiresAt: Date;
      usedAt: Date | null;
      revokedAt: Date | null;
    }>>`
      SELECT id, "tokenHash", "userId", family, "expiresAt", "usedAt", "revokedAt"
      FROM refresh_tokens
      WHERE "tokenHash" = ${tokenHash}
      FOR UPDATE
    `;
    if (!locked) {
      throw Object.assign(new Error('Refresh token not found'), { status: 401 });
    }

    if (locked.usedAt || locked.revokedAt) {
      logger.warn({ family: locked.family, userId: locked.userId }, 'Refresh token reuse detected - revoking family');
      await tx.refreshToken.updateMany({
        where: { family: locked.family, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw Object.assign(new Error('Refresh token already used. Please log in again.'), { status: 401 });
    }

    if (locked.expiresAt < new Date()) {
      throw Object.assign(new Error('Refresh token expired'), { status: 401 });
    }

    await tx.refreshToken.update({
      where: { id: locked.id },
      data: { usedAt: new Date() },
    });

    // Fetch user for the access token
    const user = await tx.user.findUnique({ where: { id: locked.userId } });

    const newRawToken = crypto.randomBytes(64).toString('hex');
    const newHash = sha256(newRawToken);
    const family = locked.family;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + REFRESH_EXPIRY_DAYS);

    await tx.refreshToken.create({
      data: { tokenHash: newHash, userId: user!.id, family, expiresAt },
    });

    return { userId: user!.id, newToken: newRawToken, family };
  });

  return { userId: result.userId, refreshToken: result.newToken, family: result.family };
}

export async function revokeAllRefreshTokens(userId: string): Promise<number> {
  const result = await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return result.count;
}

export async function requestPasswordReset(email: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return;

  const resetToken = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 1);

  await prisma.passwordReset.create({
    data: { userId: user.id, token: resetToken, expiresAt },
  });

  const resetUrl = `${process.env.APP_BASE_URL}/reset-password?token=${resetToken}`;
  await sendEmail({
    to: user.email,
    subject: 'Reset your TokyoTrip password',
    text: `Click here to reset your password: ${resetUrl}. This link expires in 1 hour.`,
    html: `<p>Click <a href="${resetUrl}">here</a> to reset your password.</p><p>This link expires in 1 hour.</p>`,
  });
}

export async function resetPassword(token: string, password: string): Promise<void> {
  const reset = await prisma.passwordReset.findFirst({
    where: { token, expiresAt: { gt: new Date() }, usedAt: null },
    orderBy: { createdAt: 'desc' as const },
  });

  if (!reset) {
    throw Object.assign(new Error('Invalid or expired token'), { status: 401 });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.$transaction([
    prisma.user.update({ where: { id: reset.userId }, data: { passwordHash } }),
    prisma.passwordReset.update({ where: { id: reset.id }, data: { usedAt: new Date() } }),
  ]);
}

export const authService = {
  issueAccessToken,
  issueRefreshToken,
  rotateRefreshToken,
  revokeAllRefreshTokens,
  requestPasswordReset,
  resetPassword,
};

export {};