import { z, ZodSchema, ZodError } from 'zod';
import { Request, Response, NextFunction } from 'express';

export const LoginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export const RegisterSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  email: z.string().email('Invalid email format'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export const CreateTripSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  destination: z.string().max(200).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
});

export const UpdateTripSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  destination: z.string().max(200).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')).nullable(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')).nullable(),
  status: z.enum(['ACTIVE', 'ENDED', 'ARCHIVED']).optional(),
});

export const PublishTripSchema = z.object({
  slug: z.string().min(3).max(100).regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/, 'Slug must be lowercase alphanumeric with hyphens').optional(),
  customDomain: z.string().max(253).optional().nullable(),
});

export const CreateEntrySchema = z.object({
  type: z.enum(['TEXT', 'PHOTO', 'VOICE', 'VIDEO', 'LOCATION']),
  rawText: z.string().max(5000).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  address: z.string().max(500).optional(),
  category: z.enum(['FOOD_DRINK', 'SIGHTSEEING', 'ACCOMMODATION', 'TRANSPORTATION', 'SHOPPING', 'TIP_WARNING', 'MISC']).optional(),
  sentiment: z.enum(['POSITIVE', 'NEUTRAL', 'NEGATIVE']).optional(),
});

export const UpdateEntrySchema = z.object({
  rawText: z.string().max(5000).optional(),
  category: z.enum(['FOOD_DRINK', 'SIGHTSEEING', 'ACCOMMODATION', 'TRANSPORTATION', 'SHOPPING', 'TIP_WARNING', 'MISC']).optional(),
  sentiment: z.enum(['POSITIVE', 'NEUTRAL', 'NEGATIVE']).optional(),
  tags: z.array(z.string()).optional(),
});

export const ForgotPasswordSchema = z.object({
  email: z.string().email('Invalid email format'),
});

export const ResetPasswordSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export const CreateReactionSchema = z.object({
  emoji: z.string().max(10),
});

export const CreateCommentSchema = z.object({
  text: z.string().min(1, 'Comment is required').max(2000),
});

export const UpdateProfileSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100).optional(),
  avatar: z.string().max(500).optional(),
  email: z.string().email('Invalid email format').optional(),
  password: z.string().min(6, 'Password must be at least 6 characters').optional(),
});

export function validate<T>(body: unknown, schema: ZodSchema<T>): T {
  return schema.parse(body);
}

export function validateAsync(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = schema.parse(req.body);
      req.validated = data;
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        return res.status(400).json({ error: err.errors[0].message });
      }
      next(err);
    }
  };
}