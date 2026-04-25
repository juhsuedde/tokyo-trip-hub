import { Request, Response, NextFunction } from 'express';

export function sessionMiddleware(req: Request, res: Response, next: NextFunction): void {
  next();
}
export async function requireUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  next();
}
export async function attachUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  next();
}
export const optionalAuth = attachUser;
export {};