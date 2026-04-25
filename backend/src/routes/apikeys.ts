import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireTier } from '../middleware/subscription';
import { createApiKey, listApiKeys, revokeApiKey, validateApiKey } from '../lib/apiKey.service';

const router = Router();

router.use(requireAuth);

// POST /api/apikeys - Create API key (PRO only)
router.post('/', requireTier('PRO'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, expiresInDays } = req.body;
    const result = await createApiKey(req.user!.id, name || 'API Key', expiresInDays);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

// GET /api/apikeys - List API keys
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const keys = await listApiKeys(req.user!.id);
    res.json(keys);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/apikeys/:id - Revoke API key
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await revokeApiKey(req.params.id, req.user!.id);
    res.json({ message: 'API key revoked' });
  } catch (err) {
    next(err);
  }
});

async function requireApiKey(req: Request, res: Response, next: NextFunction) {
  const rawKey = req.headers['x-api-key'] as string | undefined;
  if (!rawKey) {
    return res.status(401).json({ error: 'API key required' });
  }

  const valid = await validateApiKey(rawKey);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid or expired API key' });
  }

  req.user = {
    id: valid.userId,
    tier: valid.tier,
    isAdmin: valid.isAdmin,
    email: '',
    name: '',
  };

  next();
}

export { router, requireApiKey };
export default router;
