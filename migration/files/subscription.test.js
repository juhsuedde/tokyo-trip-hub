// backend/src/middleware/__tests__/subscription.test.js

import { describe, it, expect, vi } from 'vitest';
import { enforceTripLimit, enforceExportFormat, TIER_LIMITS } from '../subscription.js';

vi.mock('../../lib/prisma.js', () => ({
  prisma: {
    tripMembership: {
      count: vi.fn(),
    },
  },
}));

import { prisma } from '../../lib/prisma.js';

function mockReqRes(user = null, body = {}, query = {}) {
  const req = { user, body, query, params: {} };
  const res = {
    _status: null,
    _body: null,
    status(c) { this._status = c; return this; },
    json(b) { this._body = b; return this; },
  };
  const next = vi.fn();
  return { req, res, next };
}

// ── TIER_LIMITS sanity ────────────────────────────────────────────────────────

describe('TIER_LIMITS', () => {
  it('FREE allows up to 3 trips', () => {
    expect(TIER_LIMITS.FREE.maxTrips).toBe(3);
  });

  it('PREMIUM allows unlimited trips', () => {
    expect(TIER_LIMITS.PREMIUM.maxTrips).toBe(Infinity);
  });

  it('FREE only allows markdown export', () => {
    expect(TIER_LIMITS.FREE.exportFormats).toEqual(['markdown']);
  });

  it('PREMIUM allows all export formats', () => {
    expect(TIER_LIMITS.PREMIUM.exportFormats).toContain('pdf');
    expect(TIER_LIMITS.PREMIUM.exportFormats).toContain('epub');
  });
});

// ── enforceTripLimit ──────────────────────────────────────────────────────────

describe('enforceTripLimit', () => {
  it('allows FREE user under the limit', async () => {
    prisma.tripMembership.count.mockResolvedValue(1);
    const { req, res, next } = mockReqRes({ id: 'u1', tier: 'FREE' });
    await enforceTripLimit(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('blocks FREE user at exactly limit (3)', async () => {
    prisma.tripMembership.count.mockResolvedValue(3);
    const { req, res, next } = mockReqRes({ id: 'u1', tier: 'FREE' });
    await enforceTripLimit(req, res, next);
    expect(res._status).toBe(403);
    expect(res._body.code).toBe('TRIP_LIMIT_REACHED');
  });

  it('always allows PREMIUM regardless of count', async () => {
    prisma.tripMembership.count.mockResolvedValue(99);
    const { req, res, next } = mockReqRes({ id: 'u1', tier: 'PREMIUM' });
    await enforceTripLimit(req, res, next);
    expect(next).toHaveBeenCalled();
    // Should not even query DB
    expect(prisma.tripMembership.count).not.toHaveBeenCalled();
  });

  it('returns 401 with no user', async () => {
    const { req, res, next } = mockReqRes(null);
    await enforceTripLimit(req, res, next);
    expect(res._status).toBe(401);
  });
});

// ── enforceExportFormat ───────────────────────────────────────────────────────

describe('enforceExportFormat', () => {
  it('allows FREE user to export markdown', () => {
    const { req, res, next } = mockReqRes({ id: 'u1', tier: 'FREE' }, { format: 'markdown' });
    enforceExportFormat(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('blocks FREE user from exporting pdf', () => {
    const { req, res, next } = mockReqRes({ id: 'u1', tier: 'FREE' }, { format: 'pdf' });
    enforceExportFormat(req, res, next);
    expect(res._status).toBe(403);
    expect(res._body.code).toBe('EXPORT_FORMAT_RESTRICTED');
  });

  it('allows PREMIUM user to export pdf', () => {
    const { req, res, next } = mockReqRes({ id: 'u1', tier: 'PREMIUM' }, { format: 'pdf' });
    enforceExportFormat(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('allows PREMIUM user to export epub', () => {
    const { req, res, next } = mockReqRes({ id: 'u1', tier: 'PREMIUM' }, { format: 'epub' });
    enforceExportFormat(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('passes through when no format specified', () => {
    const { req, res, next } = mockReqRes({ id: 'u1', tier: 'FREE' }, {});
    enforceExportFormat(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('is case-insensitive (PDF → pdf)', () => {
    const { req, res, next } = mockReqRes({ id: 'u1', tier: 'FREE' }, { format: 'PDF' });
    enforceExportFormat(req, res, next);
    expect(res._status).toBe(403);
  });
});
