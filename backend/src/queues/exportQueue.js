/**
 * backend/src/queues/exportQueue.js
 * Bull queue worker for async export generation
 */
require('dotenv').config();
const Bull = require('bull');
const { generateExport } = require('../lib/exportEngine');

const exportQueue = new Bull('generate-export', {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
  },
});

exportQueue.process(async (job) => {
  const { tripId, format, template, entryIds, userId } = job.data;
  console.log(`[exportQueue] Processing job ${job.id}: ${format} export for trip ${tripId}`);

  try {
    await job.progress(10);
    const result = await generateExport({ tripId, format, template, entryIds, jobId: job.id });
    await job.progress(100);

    // Notify via Socket.io
    const io = global.__io;
    if (io) {
      io.to(`trip:${tripId}`).emit('export-complete', {
        jobId: job.id,
        status: 'completed',
        downloadUrl: result.downloadUrl,
        format,
      });
    }

    return result;
  } catch (err) {
    console.error(`[exportQueue] Job ${job.id} failed:`, err);
    const io = global.__io;
    if (io) {
      io.to(`trip:${tripId}`).emit('export-complete', {
        jobId: job.id,
        status: 'failed',
        error: err.message,
      });
    }
    throw err;
  }
});

exportQueue.on('completed', (job, result) => {
  console.log(`[exportQueue] Job ${job.id} completed: ${result.filePath}`);
});

exportQueue.on('failed', (job, err) => {
  console.error(`[exportQueue] Job ${job.id} failed:`, err.message);
});

module.exports = { exportQueue };
