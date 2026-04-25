// Types for TokyoTrip Backend
import type { Request } from 'express';

export interface RequestUser {
  id: string;
  email: string;
  name: string;
  tier: 'FREE' | 'PREMIUM' | 'PRO';
  tempSession?: string | null;
  avatar?: string | null;
  isAdmin?: boolean;
}

declare global {
  namespace Express {
    interface Request {
      user?: RequestUser;
      sessionToken?: string | null;
      correlationId?: string;
      validated?: Record<string, unknown>;
    }
  }
}

// Queue Jobs
export interface TranscribeAudioJob {
  entryId: string;
  tripId: string;
  contentUrl: string;
  userId: string;
}

export interface ProcessImageJob {
  entryId: string;
  tripId: string;
  contentUrl: string;
  userId: string;
}

export interface ExportJob {
  tripId: string;
  format: 'PDF' | 'EPUB' | 'MARKDOWN';
  template: 'default' | 'minimal' | 'photobook';
  entryIds: string[] | null;
  userId: string;
}

export type Category = 'FOOD_DRINK' | 'SIGHTSEEING' | 'ACCOMMODATION' | 'TRANSPORTATION' | 'SHOPPING' | 'TIP_WARNING' | 'MISC';
export type Sentiment = 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE';
export type Tier = 'FREE' | 'PREMIUM' | 'PRO';
export type TripStatus = 'ACTIVE' | 'ENDED' | 'ARCHIVED';
export type Role = 'OWNER' | 'MEMBER';
export type EntryType = 'TEXT' | 'PHOTO' | 'VOICE' | 'VIDEO' | 'LOCATION';

export interface VisionAnalysisResult {
  ocrText: string;
  category: Category;
  tags: string[];
  sentiment: Sentiment;
}

export interface AIProvider {
  transcribeAudio(audioFilePath: string): Promise<string>;
  analyzeImage(imageUrl: string): Promise<VisionAnalysisResult>;
}

export interface ServerToClientEvents {
  'new-entry': (entry: unknown) => void;
  'entry-deleted': (payload: { entryId: string }) => void;
  'entry-updated': (entry: unknown) => void;
  'ai-processing': (payload: { entryId: string; status: string; task: string }) => void;
  'export-complete': (payload: { jobId: string; status: string; downloadUrl?: string; format?: string; error?: string }) => void;
}

export interface ClientToServerEvents {
  'join-trip': (tripId: string) => void;
  'leave-trip': (tripId: string) => void;
}

export interface SocketData {
  user: RequestUser;
}

export interface ApiError {
  error: string;
  message?: string;
  limit?: number;
  allowed?: string[];
  upgrade?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  pagination: {
    hasMore: boolean;
    nextCursor: string | null;
    limit: number;
  };
}

export type RoleHierarchy = Record<Role, number>;
export type TierLimits = {
  maxTrips: number | null;
  maxEntriesPerTrip: number;
  allowedExports: string[];
  unlimitedRetention: boolean;
  customDomain: boolean;
  whiteLabel: boolean;
  apiAccess: boolean;
};

export {};