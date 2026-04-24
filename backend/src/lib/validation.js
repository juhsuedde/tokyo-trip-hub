const { z } = require('zod');

const LoginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

const RegisterSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  email: z.string().email('Invalid email format'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

const CreateTripSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  destination: z.string().max(200).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
});

const UpdateTripSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  destination: z.string().max(200).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')).nullable(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')).nullable(),
  status: z.enum(['ACTIVE', 'ENDED', 'ARCHIVED']).optional(),
});

const PublishTripSchema = z.object({
  slug: z.string().min(3).max(100).regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/, 'Slug must be lowercase alphanumeric with hyphens').optional(),
  customDomain: z.string().max(253).optional().nullable(),
});

const CreateEntrySchema = z.object({
  type: z.enum(['TEXT', 'PHOTO', 'VOICE', 'VIDEO', 'LOCATION']),
  rawText: z.string().max(5000).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  address: z.string().max(500).optional(),
  category: z.enum(['FOOD_DRINK', 'SIGHTSEEING', 'ACCOMMODATION', 'TRANSPORTATION', 'SHOPPING', 'TIP_WARNING', 'MISC']).optional(),
  sentiment: z.enum(['POSITIVE', 'NEUTRAL', 'NEGATIVE']).optional(),
});

const UpdateEntrySchema = z.object({
  rawText: z.string().max(5000).optional(),
  category: z.enum(['FOOD_DRINK', 'SIGHTSEEING', 'ACCOMMODATION', 'TRANSPORTATION', 'SHOPPING', 'TIP_WARNING', 'MISC']).optional(),
  sentiment: z.enum(['POSITIVE', 'NEUTRAL', 'NEGATIVE']).optional(),
  tags: z.array(z.string()).optional(),
});

const CreateReactionSchema = z.object({
  emoji: z.string().max(10),
});

const CreateCommentSchema = z.object({
  text: z.string().min(1, 'Comment is required').max(2000),
});

const UpdateProfileSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100).optional(),
  avatar: z.string().max(500).optional(),
  email: z.string().email('Invalid email format').optional(),
  password: z.string().min(6, 'Password must be at least 6 characters').optional(),
});

function validate(body, schema) {
  return schema.parse(body);
}

function validateAsync(schema) {
  return (req, res, next) => {
    try {
      const data = schema.parse(req.body);
      req.validated = data;
      next();
    } catch (err) {
      if (err.name === 'ZodError') {
        return res.status(400).json({ error: err.errors[0].message });
      }
      next(err);
    }
  };
}

module.exports = {
  LoginSchema,
  RegisterSchema,
  CreateTripSchema,
  UpdateTripSchema,
  PublishTripSchema,
  CreateEntrySchema,
  UpdateEntrySchema,
  CreateReactionSchema,
  CreateCommentSchema,
  UpdateProfileSchema,
  validate,
  validateAsync,
};