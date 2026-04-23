// backend/src/middleware/__tests__/auth.test.js

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { requireAuth, optionalAuth, requireTier, requireTripRole, signToken } from '../auth.js';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../../lib/redis.js', () => ({
  redis: {
    get: vi.fn().mockResolvedValue(null), // not blacklisted by default
  },
}));

vi.mock('../../lib/prisma.js', () => ({
  prisma: {
    tripMembership: {
      findUnique: vi.fn(),
    },
  },
}));

import { redis } from '../../lib/redis.js';
import { prisma } from '../../lib/prisma.js';

process.env.JWT_SECRET = 'test-secret-for-unit-tests';

// ── Helpers ───────────────────────────────────────────────────────────────────

function mockReqRes(overrides = {}) {
  const req = {
    headers: {},
    cookies: {},
    params: {},
    user: null,
    ...overrides,
  };
  const res = {
    _status: null,
    _body: null,
    status(code) { this._status = code; return this; },
    json(body) { this._body = body; return this; },
  };
  const next = vi.fn();
  return { req, res, next };
}

function makeToken(payload = {}) {
  const defaultUser = { id: 'u1', email: 'a@b.com', name: 'Alice', tier: 'FREE' };
  return signToken({ ...defaultUser, ...payload }, payload.tier ?? 'FREE');
}

// ── requireAuth ───────────────────────────────────────────────────────────────

describe('requireAuth', () => {
  it('calls next() and sets req.user for a valid token', async () => {
    const { req, res, next } = mockReqRes();
    req.headers.authorization = `Bearer ${makeToken()}`;

    await requireAuth(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user.id).toBe('u1');
    expect(req.user.tier).toBe('FREE');
  });

  it('returns 401 for missing token', async () => {
    const { req, res, next } = mockReqRes();
    await requireAuth(req, res, next);
    expect(res._status).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 for malformed token', async () => {
    const { req, res, next } = mockReqRes();
    req.headers.authorization = 'Bearer garbage.token.value';
    await requireAuth(req, res, next);
    expect(res._status).toBe(401);
  });

  it('returns 401 for blacklisted token', async () => {
    redis.get.mockResolvedValueOnce('1'); // simulate blacklisted
    const { req, res, next } = mockReqRes();
    req.headers.authorization = `Bearer ${makeToken()}`;
    await requireAuth(req, res, next);
    expect(res._status).toBe(401);
    expect(res._body.error).toMatch(/revoked/i);
  });

  it('reads token from cookie as fallback', async () => {
    const { req, res, next } = mockReqRes();
    req.cookies.token = makeToken();
    await requireAuth(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});

// ── optionalAuth ──────────────────────────────────────────────────────────────

describe('optionalAuth', () => {
  it('calls next() with no token, req.user stays null', async () => {
    const { req, res, next } = mockReqRes();
    await optionalAuth(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.user).toBeNull();
  });

  it('populates req.user when valid token present', async () => {
    const { req, res, next } = mockReqRes();
    req.headers.authorization = `Bearer ${makeToken()}`;
    await optionalAuth(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.user?.id).toBe('u1');
  });

  it('still calls next() for invalid token (soft gate)', async () => {
    const { req, res, next } = mockReqRes();
    req.headers.authorization = 'Bearer bad.token';
    await optionalAuth(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.user).toBeNull();
  });
});

// ── requireTier ───────────────────────────────────────────────────────────────

describe('requireTier', () => {
  it('allows FREE user on FREE-required route', () => {
    const { req, res, next } = mockReqRes({ user: { id: 'u1', tier: 'FREE' } });
    requireTier('FREE')(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('blocks FREE user from PREMIUM-required route', () => {
    const { req, res, next } = mockReqRes({ user: { id: 'u1', tier: 'FREE' } });
    requireTier('PREMIUM')(req, res, next);
    expect(res._status).toBe(403);
    expect(res._body.code ?? res._body.requiredTier).toBeTruthy();
  });

  it('allows PREMIUM user on PREMIUM-required route', () => {
    const { req, res, next } = mockReqRes({ user: { id: 'u1', tier: 'PREMIUM' } });
    requireTier('PREMIUM')(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('returns 401 if req.user is missing', () => {
    const { req, res, next } = mockReqRes({ user: null });
    requireTier('FREE')(req, res, next);
    expect(res._status).toBe(401);
  });
});

// ── requireTripRole ───────────────────────────────────────────────────────────

describe('requireTripRole', () => {
  const tripId = 'trip_1';

  it('allows access when user has sufficient role', async () => {
    prisma.tripMembership.findUnique.mockResolvedValue({ role: 'EDITOR', tripId, userId: 'u1' });
    const { req, res, next } = mockReqRes({
      user: { id: 'u1', tier: 'FREE' },
      params: { id: tripId },
    });
    await requireTripRole('EDITOR')(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.membership.role).toBe('EDITOR');
  });

  it('allows OWNER on EDITOR-required route', async () => {
    prisma.tripMembership.findUnique.mockResolvedValue({ role: 'OWNER', tripId, userId: 'u1' });
    const { req, res, next } = mockReqRes({
      user: { id: 'u1', tier: 'FREE' },
      params: { id: tripId },
    });
    await requireTripRole('EDITOR')(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('blocks VIEWER from EDITOR-required route', async () => {
    prisma.tripMembership.findUnique.mockResolvedValue({ role: 'VIEWER', tripId, userId: 'u1' });
    const { req, res, next } = mockReqRes({
      user: { id: 'u1', tier: 'FREE' },
      params: { id: tripId },
    });
    await requireTripRole('EDITOR')(req, res, next);
    expect(res._status).toBe(403);
  });

  it('returns 403 when user is not a member', async () => {
    prisma.tripMembership.findUnique.mockResolvedValue(null);
    const { req, res, next } = mockReqRes({
      user: { id: 'u1', tier: 'FREE' },
      params: { id: tripId },
    });
    await requireTripRole('VIEWER')(req, res, next);
    expect(res._status).toBe(403);
    expect(res._body.error).toMatch(/member/i);
  });
});
