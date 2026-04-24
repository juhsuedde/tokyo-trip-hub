'use strict';

const crypto = require('crypto');
const { prisma } = require('../lib/prisma');
const { logger } = require('./logger');

const sha256 = (raw) => crypto.createHash('sha256').update(raw).digest('hex');

async function createApiKey(userId, name, expiresInDays) {
  const rawKey = `tk_${crypto.randomBytes(32).toString('hex')}`;
  const keyHash = sha256(rawKey);
  
  const expiresAt = expiresInDays 
    ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000) 
    : null;

  const apiKey = await prisma.apiKey.create({
    data: { userId, name, keyHash, expiresAt },
  });

  return { id: apiKey.id, key: rawKey, name: apiKey.name, expiresAt: apiKey.expiresAt };
}

async function listApiKeys(userId) {
  return prisma.apiKey.findMany({
    where: { userId },
    select: { id: true, name: true, lastUsedAt: true, expiresAt: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });
}

async function revokeApiKey(apiKeyId, userId) {
  return prisma.apiKey.delete({
    where: { id: apiKeyId, userId },
  });
}

async function validateApiKey(rawKey) {
  const keyHash = sha256(rawKey);
  const apiKey = await prisma.apiKey.findUnique({
    where: { keyHash },
    include: { user: true },
  });

  if (!apiKey) return null;
  if (apiKey.expiresAt && apiKey.expiresAt < new Date()) return null;

  await prisma.apiKey.update({
    where: { id: apiKey.id },
    data: { lastUsedAt: new Date() },
  });

  return {
    id: apiKey.id,
    userId: apiKey.userId,
    tier: apiKey.user.tier,
    isAdmin: apiKey.user.isAdmin,
  };
}

module.exports = { createApiKey, listApiKeys, revokeApiKey, validateApiKey };