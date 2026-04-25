import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import { prisma } from '../lib/prisma';
import { exportQueue } from '../queues/exportQueue';
import { EXPORTS_DIR } from '../lib/exportEngine';
import { requireUser } from '../middleware/session';

const router = Router();
router.use(requireUser);

// POST /api/trips/:id/export
router.post('/trips/:id/export', async (req, res, next) => {
  try {
    const { id: tripId } = req.params;
    const { format = 'PDF', template = 'default', entryIds } = req.body;
    const userId = req.user?.id;

    if (!['PDF', 'EPUB', 'MARKDOWN'].includes(format)) {
      return res.status(400).json({ error: 'Invalid format. Must be PDF, EPUB, or MARKDOWN.' });
    }
    if (!['default', 'minimal', 'photobook'].includes(template)) {
      return res.status(400).json({ error: 'Invalid template.' });
    }

    const membership = await prisma.tripMembership.findFirst({
      where: { tripId, userId },
    });
    if (!membership) {
      return res.status(403).json({ error: 'Not a member of this trip.' });
    }

    const job = await exportQueue.add(
      { tripId, format, template, entryIds: entryIds || null, userId },
      {
        attempts: 2,
        backoff: { type: 'fixed', delay: 5000 },
        removeOnComplete: false,
        removeOnFail: false,
      }
    );

    res.json({ jobId: String(job.id), status: 'queued' });
  } catch (err) {
    next(err);
  }
});

// GET /api/export/:jobId/status
router.get('/:jobId/status', async (req, res, next) => {
  try {
    const { jobId } = req.params;
    const job = await exportQueue.getJob(jobId);

    if (!job) {
      return res.status(404).json({ error: 'Job not found.' });
    }

    const state = await job.getState();
    const result = job.returnvalue;

    if (state === 'completed' && result) {
      return res.json({
        status: 'completed',
        downloadUrl: result.downloadUrl,
        format: result.format,
      });
    }

    if (state === 'failed') {
      return res.json({
        status: 'failed',
        error: job.failedReason || 'Export generation failed.',
      });
    }

    const progress = job.progress();
    return res.json({
      status: state === 'active' ? 'processing' : 'queued',
      progress: typeof progress === 'number' ? progress : 0,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/export/:jobId/download
router.get('/:jobId/download', async (req, res, next) => {
  try {
    const { jobId } = req.params;
    const job = await exportQueue.getJob(jobId);

    if (!job) {
      return res.status(404).json({ error: 'Job not found.' });
    }

    const state = await job.getState();
    if (state !== 'completed') {
      return res.status(400).json({ error: `Export not ready. Status: ${state}` });
    }

    const result = job.returnvalue;
    const filePath = result?.filePath;

    if (!filePath || !fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Export file not found or expired.' });
    }

    const ext = path.extname(filePath).slice(1);
    const mimeTypes: Record<string, string> = {
      pdf: 'application/pdf',
      epub: 'application/epub+zip',
      md: 'text/markdown; charset=utf-8',
    };

    const tripData = job.data;
    const fileName = `trip-export.${ext}`;

    res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    next(err);
  }
});

export default router;
