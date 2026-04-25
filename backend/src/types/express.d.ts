// Express type extensions
import type { RequestUser } from './index';
import type { Logger } from 'pino';

declare global {
  namespace Express {
    interface Request {
      user?: RequestUser;
      sessionToken?: string | null;
      correlationId?: string;
      validated?: Record<string, unknown>;
      files?: {
        file?: any;
      } | null;
      log?: Logger;
    }
  }
}

export {};