/**
 * backend/src/routes/entries.js  (Phase 2 replacement)
 *
 * Changes from Phase 1:
 *  - After creating a VOICE entry → enqueue transcribe-audio job
 *  - After creating a PHOTO entry → enqueue process-image-ocr job
 *  - New GET /:id/status endpoint
 */

const express = require('express');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { prisma } = require('../lib/prisma');
const { logger } = require('../lib/logger');
const { attachUser } = require('../middleware/session');
let aiQueue;
if (process.env.NODE_ENV !== 'test') {
  try {
    ({ aiQueue } = require('../queues/aiQueue'));
  } catch {
    // Bull/Redis unavailable — AI jobs will be skipped
  }
}
const { CreateEntrySchema, CreateReactionSchema, CreateCommentSchema, UpdateEntrySchema, validateAsync } = require('../lib/validation');
const { saveFile, deleteFile } = require('../lib/storage');
const { sanitizeHtml } = require('../lib/sanitizer');
const { checkEntryLimit } = require('../middleware/subscription');

let sharp = null;
try {
  sharp = require('sharp');
} catch (e) {
  logger.warn('sharp not available - MIME validation will use extension only');
}

const router = express.Router();
router.use(attachUser);

const BASE_URL = process.env.BASE_URL || 'http://localhost:3001';

const ALLOWED_MIME_TYPES = {
  PHOTO: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  VIDEO: ['video/mp4', 'video/webm', 'video/quicktime'],
  VOICE: ['audio/mpeg', 'audio/wav', 'audio/webm', 'audio/ogg'],
};

const ALLOWED_EXTENSIONS = {
  PHOTO: ['.jpg', '.jpeg', '.png', '.webp', '.gif'],
  VIDEO: ['.mp4', '.webm', '.mov'],
  VOICE: ['.mp3', '.wav', '.webm', '.ogg'],
};

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

async function validateFileMime(file, type) {
  const allowedExts = ALLOWED_EXTENSIONS[type];
  if (!allowedExts) return false;

  const ext = path.extname(file.name)?.toLowerCase();
  if (!ext || !allowedExts.includes(ext)) return false;

  // Check file size
  if (file.size > MAX_FILE_SIZE) {
    logger.warn({ size: file.size, max: MAX_FILE_SIZE }, 'File too large');
    return false;
  }

  if (!sharp) return true;

  try {
    const metadata = await sharp(file.tempFilePath).metadata();
    if (!metadata?.format) return false;

    const formatToMime = {
      jpeg: 'image/jpeg',
      png: 'image/png',
      webp: 'image/webp',
      gif: 'image/gif',
      mp4: 'video/mp4',
      webm: 'video/webm',
      mov: 'video/quicktime',
      mp3: 'audio/mpeg',
      wav: 'audio/wav',
      ogg: 'audio/ogg',
    };

    const detectedMime = formatToMime[metadata.format];
    const allowedMimes = ALLOWED_MIME_TYPES[type];
    return allowedMimes.includes(detectedMime);
  } catch {
    return false;
  }
}

// ── POST /api/entries/trips/:tripId/entries ────────────────────────────────────
router.post('/trips/:tripId/entries', checkEntryLimit, async (req, res, next) => {
  try {
    const { tripId } = req.params;
    const userId = req.user.id;

    // Verify membership
    const membership = await prisma.tripMembership.findUnique({
      where: { userId_tripId: { userId, tripId } },
    });
    if (!membership) return res.status(403).json({ error: 'Not a member of this trip' });

    let contentUrl = null;
    const type = (req.body.type || req.files?.file ? req.body.type : 'TEXT').toUpperCase();

    if (req.files?.file) {
      if (!(await validateFileMime(req.files.file, type))) {
        return res.status(400).json({ error: 'Invalid file type' });
      }
      contentUrl = await saveFile(req.files.file, type);
    }

    const entry = await prisma.entry.create({
      data: {
        tripId,
        userId,
        type,
        rawText: sanitizeHtml(req.body.rawText) || null,
        contentUrl,
        latitude: req.body.latitude ? parseFloat(req.body.latitude) : null,
        longitude: req.body.longitude ? parseFloat(req.body.longitude) : null,
        address: sanitizeHtml(req.body.address) || null,
      },
      include: {
        user: { select: { id: true, name: true, avatar: true } },
        reactions: true,
        comments: { include: { user: { select: { id: true, name: true } } } },
      },
    });

    // ── Enqueue AI jobs ───────────────────────────────────────────────────────
    if (aiQueue) {
      if (type === 'VOICE' && contentUrl) {
        const audioUrl = contentUrl.startsWith('http') ? contentUrl : `${BASE_URL}${contentUrl}`;
        await aiQueue.add('transcribe-audio', {
          entryId: entry.id,
          tripId,
          contentUrl: audioUrl,
        });
      }

      if (type === 'PHOTO' && contentUrl) {
        const imageUrl = contentUrl.startsWith('http') ? contentUrl : `${BASE_URL}${contentUrl}`;
        await aiQueue.add('process-image-ocr', {
          entryId: entry.id,
          tripId,
          contentUrl: imageUrl,
        });
      }
    }

    // ── Real-time broadcast ───────────────────────────────────────────────────
    const io = req.app.get('io');
    if (io) io.to(`trip:${tripId}`).emit('new-entry', entry);

    res.status(201).json(entry);
  } catch (err) {
    next(err);
  }
});

// ── DELETE /api/entries/:id ───────────────────────────────────────────────────
router.delete('/:id', async (req, res, next) => {
  try {
    const entry = await prisma.entry.findUnique({ where: { id: req.params.id } });
    if (!entry) return res.status(404).json({ error: 'Entry not found' });
    if (entry.userId !== req.user.id) return res.status(403).json({ error: 'Forbidden' });

    // Soft delete instead of hard delete
    await prisma.entry.update({
      where: { id: req.params.id },
      data: { deletedAt: new Date() },
    });

    const io = req.app.get('io');
    if (io) io.to(`trip:${entry.tripId}`).emit('entry-deleted', { entryId: entry.id });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// ── PATCH /api/entries/:id ───────────────────────────────────────────────────
router.patch('/:id', validateAsync(UpdateEntrySchema), async (req, res, next) => {
  try {
    const entry = await prisma.entry.findUnique({ where: { id: req.params.id } });
    if (!entry) return res.status(404).json({ error: 'Entry not found' });
    if (entry.userId !== req.user.id) return res.status(403).json({ error: 'Forbidden' });

    const { rawText, category, sentiment, tags } = req.validated;
    const data = {};
    if (rawText !== undefined) data.rawText = sanitizeHtml(rawText);
    if (category !== undefined) data.category = category;
    if (sentiment !== undefined) data.sentiment = sentiment;
    if (tags !== undefined) data.tags = tags;

    const updated = await prisma.entry.update({
      where: { id: req.params.id },
      data,
      include: {
        user: { select: { id: true, name: true, avatar: true } },
        reactions: true,
        comments: { include: { user: { select: { id: true, name: true } } } },
      },
    });

    const io = req.app.get('io');
    if (io) io.to(`trip:${entry.tripId}`).emit('entry-updated', updated);

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// ── POST /api/entries/:id/reactions ──────────────────────────────────────────
router.post('/:id/reactions', validateAsync(CreateReactionSchema), async (req, res, next) => {
  try {
    const { emoji } = req.validated;
    const entryId = req.params.id;
    const userId = req.user.id;

    const existing = await prisma.reaction.findUnique({
      where: { entryId_userId_emoji: { entryId, userId, emoji } },
    });

    if (existing) {
      await prisma.reaction.delete({ where: { id: existing.id } });
    } else {
      await prisma.reaction.create({ data: { entryId, userId, emoji } });
    }

    const reactions = await prisma.reaction.findMany({ where: { entryId } });
    res.json({ reactions });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/entries/:id/comments ────────────────────────────────────────────
router.post('/:id/comments', validateAsync(CreateCommentSchema), async (req, res, next) => {
  try {
    const comment = await prisma.comment.create({
      data: {
        entryId: req.params.id,
        userId: req.user.id,
        text: sanitizeHtml(req.validated.text),
      },
      include: { user: { select: { id: true, name: true } } },
    });
    res.status(201).json(comment);
  } catch (err) {
    next(err);
  }
});

// ── DELETE /api/entries/:entryId/comments/:commentId ─────────────────────────
router.delete('/:entryId/comments/:commentId', async (req, res, next) => {
  try {
    const { entryId, commentId } = req.params;
    const comment = await prisma.comment.findUnique({ where: { id: commentId } });
    if (!comment) return res.status(404).json({ error: 'Comment not found' });
    if (comment.entryId !== entryId) return res.status(400).json({ error: 'Comment does not belong to this entry' });

    // Allow comment author or entry author to delete
    if (comment.userId !== req.user.id) {
      const entry = await prisma.entry.findUnique({ where: { id: entryId } });
      if (!entry || entry.userId !== req.user.id) {
        return res.status(403).json({ error: 'Forbidden' });
      }
    }

    await prisma.comment.delete({ where: { id: commentId } });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/entries/:id/status ───────────────────────────────────────────────
router.get('/:id/status', async (req, res, next) => {
  try {
    const entry = await prisma.entry.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        type: true,
        transcription: true,
        ocrText: true,
        category: true,
        sentiment: true,
        tags: true,
      },
    });
    if (!entry) return res.status(404).json({ error: 'Entry not found' });

    // Determine if still processing
    const processing =
      (entry.type === 'VOICE' && !entry.transcription) ||
      (entry.type === 'PHOTO' && !entry.ocrText && !entry.category);

    res.json({ ...entry, processing });
  } catch (err) {
    next(err);
  }
});

module.exports = router;