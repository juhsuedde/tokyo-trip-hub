'use strict';

const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { requireTier } = require('../middleware/subscription');
const { createApiKey, listApiKeys, revokeApiKey, validateApiKey } = require('../lib/apiKey.service');

const router = express.Router();

router.use(requireAuth);

// POST /api/apikeys - Create API key (PRO only)
router.post('/', requireTier('PRO'), async (req, res, next) => {
  try {
    const { name, expiresInDays } = req.body;
    const result = await createApiKey(req.user.id, name || 'API Key', expiresInDays);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

// GET /api/apikeys - List API keys
router.get('/', async (req, res, next) => {
  try {
    const keys = await listApiKeys(req.user.id);
    res.json(keys);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/apikeys/:id - Revoke API key
router.delete('/:id', async (req, res, next) => {
  try {
    await revokeApiKey(req.params.id, req.user.id);
    res.json({ message: 'API key revoked' });
  } catch (err) {
    next(err);
  }
});

// Middleware to validate API key from header
async function requireApiKey(req, res, next) {
  const rawKey = req.headers['x-api-key'];
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
  };

  next();
}

module.exports = { router, requireApiKey };