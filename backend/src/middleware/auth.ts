import jwt from 'jsonwebtoken';
import { Response, NextFunction, Request } from 'express';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import type { RequestUser, Role } from '../types';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET env var is required');
}

export function extractToken(req: Request): string | null {
  // Try Bearer token first
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) {
    return auth.slice(7);
  }
  // Try old X-Session-Token header (backward compat)
  if (req.headers['x-session-token']) {
    return req.headers['x-session-token'] as string;
  }
  // Try cookie
  if (req.cookies?.token) {
    return req.cookies.token;
  }
  return null;
}

/**
 * requireAuth — hard gate, returns 401 if no valid token.
 * Attaches req.user = { id, email, name, tier }
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET) as jwt.JwtPayload;

    // Attach user object from JWT claims
    req.user = {
      id: payload.sub as string,
      email: payload.email as string,
      name: payload.name as string,
      tier: (payload.tier as RequestUser['tier']) || 'FREE',
      isAdmin: payload.isAdmin as boolean || false,
    };

    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      return res.status(401).json({ error: 'Token expired' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
}

/**
 * optionalAuth — soft gate, populates req.user if token present but never rejects.
 */
export async function optionalAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = extractToken(req);
  if (!token) {
    return next();
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET) as jwt.JwtPayload;
    req.user = {
      id: payload.sub as string,
      email: payload.email as string,
      name: payload.name as string,
      tier: (payload.tier as RequestUser['tier']) || 'FREE',
    };
  } catch {
    // Invalid token - treat as unauthenticated, don't reject
  }
  next();
}

/**
 * requireTripRole(role) — check user has required role for trip
 */
export function requireTripRole(requiredRole: Role) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { tripId } = req.params;
    if (!tripId) {
      return res.status(400).json({ error: 'Trip ID required' });
    }

    try {
      const membership = await prisma.tripMembership.findUnique({
        where: {
          userId_tripId: {
            userId: req.user.id,
            tripId,
          },
        },
      });

      if (!membership) {
        return res.status(403).json({ error: 'Not a member of this trip' });
      }

      const roleHierarchy: Record<Role, number> = { MEMBER: 0, OWNER: 1 };
      if (roleHierarchy[membership.role] < roleHierarchy[requiredRole]) {
        return res.status(403).json({ error: `Requires ${requiredRole} role` });
      }

      next();
    } catch (err) {
      logger.error({ err }, '[requireTripRole] error');
      res.status(500).json({ error: 'Internal error' });
    }
  };
}

/**
 * signToken — create JWT for user (short-lived access token)
 */
export function signToken(user: Partial<RequestUser>): string {
  const payload = {
    sub: user.id,
    email: user.email,
    name: user.name,
    tier: user.tier || 'FREE',
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: process.env.JWT_ACCESS_EXPIRY || '15m' });
}

export {};