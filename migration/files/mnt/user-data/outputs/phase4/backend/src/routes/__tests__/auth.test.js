// backend/src/routes/__tests__/auth.test.js
// Run with: npm test (jest or vitest)

import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';

// ── Mocks ─────────────────────────────────────────────────────────────────────

// Mock prisma
vi.mock('../../lib/prisma.js', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

// Mock redis
vi.mock('../../lib/redis.js', () => ({
  redis: {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
  },
}));

// Mock upload middleware
vi.mock('../../lib/upload.js', () => ({
  uploadAvatar: { single: () => (req, res, next) => next() },
}));

import { prisma } from '../../lib/prisma.js';
import authRouter from '../auth.js';

process.env.JWT_SECRET = 'test-secret-for-unit-tests';

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/auth', authRouter);

// ── Helpers ───────────────────────────────────────────────────────────────────

const mockUser = {
  id: 'user_1',
  email: 'test@example.com',
  name: 'Test User',
  avatarUrl: null,
  preferences: {},
  createdAt: new Date(),
  updatedAt: new Date(),
  subscription: { tier: 'FREE', status: 'ACTIVE' },
  // passwordHash is excluded by safeUser()
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /auth/register', () => {
  it('returns 201 with token and user on success', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({
      ...mockUser,
      passwordHash: '$2b$12$fakehash',
    });

    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'test@example.com', password: 'password123', name: 'Test User' });

    expect(res.status).toBe(201);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.email).toBe('test@example.com');
    expect(res.body.user.passwordHash).toBeUndefined();
  });

  it('returns 409 if email already exists', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser);

    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'test@example.com', password: 'password123', name: 'Test' });

    expect(res.status).toBe(409);
  });

  it('returns 422 if password too short', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'a@b.com', password: '123', name: 'Test' });

    expect(res.status).toBe(422);
  });

  it('returns 422 if email invalid', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'notanemail', password: 'password123', name: 'Test' });

    expect(res.status).toBe(422);
  });
});

describe('POST /auth/login', () => {
  it('returns 401 for unknown email', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'nobody@example.com', password: 'password123' });

    expect(res.status).toBe(401);
  });

  it('returns 401 for wrong password', async () => {
    // bcrypt hash for "correctpassword"
    prisma.user.findUnique.mockResolvedValue({
      ...mockUser,
      passwordHash: '$2b$12$KIXPvjXFNAT3j1VYh2kKoOhHY5FdmNMaEpHjFMfqJYOc4WVCNnCJi', // not matching
    });

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'test@example.com', password: 'wrongpassword' });

    expect(res.status).toBe(401);
  });
});

describe('GET /auth/me', () => {
  it('returns 401 with no token', async () => {
    const res = await request(app).get('/auth/me');
    expect(res.status).toBe(401);
  });

  it('returns 401 with invalid token', async () => {
    const res = await request(app)
      .get('/auth/me')
      .set('Authorization', 'Bearer invalid.token.here');
    expect(res.status).toBe(401);
  });
});
