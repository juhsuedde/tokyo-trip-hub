const router = require('express').Router();
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { prisma } = require('../lib/prisma');
const { requireUser } = require('../middleware/session');

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '../../uploads');
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const ALLOWED_AUDIO_TYPES = ['audio/mpeg', 'audio/mp4', 'audio/webm', 'audio/ogg', 'audio/wav'];
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];

/**
 * POST /api/trips/:tripId/entries
 * Create a new entry. Supports multipart (file upload) or JSON.
 *
 * For TEXT entries: JSON body { type, rawText, latitude?, longitude?, address?, capturedAt? }
 * For PHOTO/VOICE/VIDEO: multipart with `file` field + JSON fields in body
 */
router.post('/trips/:tripId/entries', requireUser, async (req, res, next) => {
  try {
    const { tripId } = req.params;

    // Verify membership
    const membership = await prisma.tripMembership.findUnique({
      where: { userId_tripId: { userId: req.user.id, tripId } },
    });
    if (!membership) {
      return res.status(403).json({ error: 'Not a member of this trip' });
    }

    const {
      type = 'TEXT',
      rawText,
      latitude,
      longitude,
      address,
      capturedAt,
      tags,
    } = req.body;

    let contentUrl = null;

    // Handle file upload
    if (req.files?.file) {
      const file = req.files.file;
      const mime = file.mimetype;

      let allowed = false;
      let subdir = '';

      if (type === 'PHOTO' && ALLOWED_IMAGE_TYPES.includes(mime)) {
        allowed = true;
        subdir = 'images';
      } else if (type === 'VOICE' && ALLOWED_AUDIO_TYPES.includes(mime)) {
        allowed = true;
        subdir = 'audio';
      } else if (type === 'VIDEO' && ALLOWED_VIDEO_TYPES.includes(mime)) {
        allowed = true;
        subdir = 'video';
      }

      if (!allowed) {
        return res.status(400).json({ error: `File type ${mime} not allowed for entry type ${type}` });
      }

      const dir = path.join(UPLOAD_DIR, subdir);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      const ext = path.extname(file.name) || `.${mime.split('/')[1]}`;
      const filename = `${uuidv4()}${ext}`;
      const filepath = path.join(dir, filename);

      await file.mv(filepath);
      contentUrl = `/uploads/${subdir}/${filename}`;
    }

    // Parse tags (can arrive as JSON string or array)
    let parsedTags = [];
    if (tags) {
      try {
        parsedTags = typeof tags === 'string' ? JSON.parse(tags) : tags;
      } catch {
        parsedTags = [];
      }
    }

    const entry = await prisma.entry.create({
      data: {
        tripId,
        userId: req.user.id,
        type,
        rawText: rawText || null,
        contentUrl,
        latitude: latitude ? parseFloat(latitude) : null,
        longitude: longitude ? parseFloat(longitude) : null,
        address: address || null,
        tags: parsedTags,
        capturedAt: capturedAt ? new Date(capturedAt) : new Date(),
      },
      include: {
        user: { select: { id: true, name: true, avatar: true } },
        reactions: true,
        comments: true,
        _count: { select: { comments: true } },
      },
    });

    // Broadcast to all trip members via WebSocket
    const io = req.app.get('io');
    io.to(`trip:${tripId}`).emit('new-entry', { entry });

    res.status(201).json({ entry });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/entries/:id
 * Get a single entry with full reactions and comments.
 */
router.get('/:id', requireUser, async (req, res, next) => {
  try {
    const entry = await prisma.entry.findUnique({
      where: { id: req.params.id },
      include: {
        user: { select: { id: true, name: true, avatar: true } },
        reactions: {
          include: { user: { select: { id: true, name: true } } },
        },
        comments: {
          include: { user: { select: { id: true, name: true, avatar: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!entry) return res.status(404).json({ error: 'Entry not found' });

    // Verify membership in the trip
    const membership = await prisma.tripMembership.findUnique({
      where: { userId_tripId: { userId: req.user.id, tripId: entry.tripId } },
    });
    if (!membership) return res.status(403).json({ error: 'Forbidden' });

    res.json({ entry });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/entries/:id
 * Delete an entry (only the author or trip owner can delete).
 */
router.delete('/:id', requireUser, async (req, res, next) => {
  try {
    const entry = await prisma.entry.findUnique({
      where: { id: req.params.id },
      include: {
        trip: { include: { memberships: true } },
      },
    });
    if (!entry) return res.status(404).json({ error: 'Entry not found' });

    const isAuthor = entry.userId === req.user.id;
    const isOwner = entry.trip.memberships.some(
      m => m.userId === req.user.id && m.role === 'OWNER'
    );

    if (!isAuthor && !isOwner) {
      return res.status(403).json({ error: 'Only the author or trip owner can delete entries' });
    }

    // Delete associated file if exists
    if (entry.contentUrl) {
      const filePath = path.join(UPLOAD_DIR, entry.contentUrl.replace('/uploads/', ''));
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }

    await prisma.entry.delete({ where: { id: entry.id } });

    const io = req.app.get('io');
    io.to(`trip:${entry.tripId}`).emit('entry-deleted', { entryId: entry.id });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/entries/:id/reactions
 * Toggle an emoji reaction (add if not present, remove if already reacted with same emoji).
 * Body: { emoji: string }
 */
router.post('/:id/reactions', requireUser, async (req, res, next) => {
  try {
    const { emoji } = req.body;
    if (!emoji) return res.status(400).json({ error: 'emoji is required' });

    const entry = await prisma.entry.findUnique({ where: { id: req.params.id } });
    if (!entry) return res.status(404).json({ error: 'Entry not found' });

    // Verify membership
    const membership = await prisma.tripMembership.findUnique({
      where: { userId_tripId: { userId: req.user.id, tripId: entry.tripId } },
    });
    if (!membership) return res.status(403).json({ error: 'Forbidden' });

    // Toggle: delete if exists, create if not
    const existing = await prisma.reaction.findUnique({
      where: {
        entryId_userId_emoji: {
          entryId: entry.id,
          userId: req.user.id,
          emoji,
        },
      },
    });

    let action;
    if (existing) {
      await prisma.reaction.delete({ where: { id: existing.id } });
      action = 'removed';
    } else {
      await prisma.reaction.create({
        data: { entryId: entry.id, userId: req.user.id, emoji },
      });
      action = 'added';
    }

    // Fetch fresh reaction counts
    const reactions = await prisma.reaction.findMany({
      where: { entryId: entry.id },
      include: { user: { select: { id: true, name: true } } },
    });

    const io = req.app.get('io');
    io.to(`trip:${entry.tripId}`).emit('reaction-updated', {
      entryId: entry.id,
      reactions,
    });

    res.json({ action, reactions });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/entries/:id/comments
 * Add a comment to an entry.
 * Body: { text: string }
 */
router.post('/:id/comments', requireUser, async (req, res, next) => {
  try {
    const { text } = req.body;
    if (!text?.trim()) return res.status(400).json({ error: 'text is required' });

    const entry = await prisma.entry.findUnique({ where: { id: req.params.id } });
    if (!entry) return res.status(404).json({ error: 'Entry not found' });

    const membership = await prisma.tripMembership.findUnique({
      where: { userId_tripId: { userId: req.user.id, tripId: entry.tripId } },
    });
    if (!membership) return res.status(403).json({ error: 'Forbidden' });

    const comment = await prisma.comment.create({
      data: { entryId: entry.id, userId: req.user.id, text: text.trim() },
      include: { user: { select: { id: true, name: true, avatar: true } } },
    });

    const io = req.app.get('io');
    io.to(`trip:${entry.tripId}`).emit('new-comment', { entryId: entry.id, comment });

    res.status(201).json({ comment });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
