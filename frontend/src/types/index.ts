// Shared types between frontend and backend
export interface Entry {
  id: string;
  type: 'TEXT' | 'PHOTO' | 'VOICE' | 'VIDEO' | 'LOCATION';
  rawText?: string;
  transcription?: string;
  contentUrl?: string;
  latitude?: string;
  longitude?: string;
  address?: string;
  category?: 'FOOD_DRINK' | 'SIGHTSEEING' | 'ACCOMMODATION' | 'TRANSPORTATION' | 'SHOPPING' | 'TIP_WARNING' | 'MISC';
  tags?: string[] | null;
  sentiment?: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE';
  user?: {
    id: string;
    name: string;
  };
  userId?: string;
  ocrText?: string;
  reactions?: Array<{ emoji: string; _count?: number }>;
  comments?: Array<{ id: string; text: string; user: { name: string } }>;
  capturedAt: string;
}

export interface RequestUser {
  id: string;
  email: string;
  name: string;
  tier: 'FREE' | 'PREMIUM' | 'PRO';
  tempSession?: string | null;
  avatar?: string | null;
  isAdmin?: boolean;
}

export interface PaginatedResponse<T> {
  items: T[];
  pagination: {
    hasMore: boolean;
    nextCursor: string | null;
    limit: number;
  };
}

export type Category = 'FOOD_DRINK' | 'SIGHTSEEING' | 'ACCOMMODATION' | 'TRANSPORTATION' | 'SHOPPING' | 'TIP_WARNING' | 'MISC';
export type Sentiment = 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE';
export type Tier = 'FREE' | 'PREMIUM' | 'PRO';
export type EntryType = 'TEXT' | 'PHOTO' | 'VOICE' | 'VIDEO' | 'LOCATION';