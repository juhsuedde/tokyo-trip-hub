/**
 * backend/src/queues/aiQueue.js  (Phase 2 refactor — multi-provider)
 *
 * Changes from Phase 2:
 *  - Removed direct openai SDK calls
 *  - Uses selectProvider() from aiProviders.js
 *  - Provider selection happens per-job so env vars can change without restart
 *  - Error handling chains through providers via withProviderFallback
 *  - All Socket.io events and DB updates are unchanged
 */

'use strict';

require('dotenv').config();
const Bull  = require('bull');
const path  = require('path');
const { prisma } = require('../lib/prisma');
const { selectProvider, withProviderFallback, GroqProvider, OpenAIProvider, OpenRouterProvider } = require('../lib/aiProviders');

// ─── Queue setup ──────────────────────────────────────────────────────────────

const aiQueue = new Bull('ai-processing', {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
  },
  defaultJobOptions: {
    attempts:  3,
    backoff:   { type: 'exponential', delay: 5000 },
    removeOnComplete: 50,
    removeOnFail:     20,
  },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function emitToTrip(tripId, event, payload) {
  const io = global.__io;
  if (io) io.to(`trip:${tripId}`).emit(event, payload);
}

async function markEntryStatus(entryId, status, extra = {}) {
  await prisma.entry.update({
    where: { id: entryId },
    data:  { ...extra },
  });
}

// ─── Processor: transcribe-audio ─────────────────────────────────────────────

aiQueue.process('transcribe-audio', async (job) => {
  const { entryId, tripId, audioFilePath } = job.data;
  console.log(`[aiQueue] transcribe-audio job ${job.id} — entry ${entryId}`);

  await job.progress(10);
  emitToTrip(tripId, 'ai-processing', { entryId, status: 'processing', task: 'transcribe' });

  let transcription;

  if (process.env.MOCK_AI === 'true') {
    const provider = selectProvider({ task: 'transcribe' });
    transcription = await provider.transcribeAudio(audioFilePath);
  } else {
    // Primary: Groq → Fallback: OpenAI
    transcription = await withProviderFallback(
      'transcribe-audio',
      async () => {
        const provider = selectProvider({ task: 'transcribe' });
        return provider.transcribeAudio(audioFilePath);
      },
      async () => {
        // Explicit fallback: if primary was Groq and failed, try OpenAI
        if (process.env.OPENAI_API_KEY && process.env.GROQ_API_KEY) {
          console.log('[aiQueue] Groq failed, falling back to OpenAI for transcription');
          const fallback = new OpenAIProvider(process.env.OPENAI_API_KEY);
          return fallback.transcribeAudio(audioFilePath);
        }
        throw new Error('No fallback provider available for transcription');
      }
    );
  }

  await job.progress(70);

  await prisma.entry.update({
    where: { id: entryId },
    data:  { transcription, rawText: transcription },
  });

  await job.progress(90);

  // After transcription, enqueue text analysis (sentiment + tags via vision provider is overkill;
  // keep this as a lightweight text-only update using existing category logic if needed)
  emitToTrip(tripId, 'entry-updated', {
    entryId,
    transcription,
    rawText: transcription,
    aiStatus: 'transcribed',
  });

  await job.progress(100);
  console.log(`[aiQueue] transcribe-audio done — entry ${entryId}`);
  return { entryId, transcription };
});

// ─── Processor: process-image-ocr ────────────────────────────────────────────

aiQueue.process('process-image-ocr', async (job) => {
  const { entryId, tripId, imageUrl } = job.data;
  console.log(`[aiQueue] process-image-ocr job ${job.id} — entry ${entryId}`);

  await job.progress(10);
  emitToTrip(tripId, 'ai-processing', { entryId, status: 'processing', task: 'vision' });

  let result;

  if (process.env.MOCK_AI === 'true') {
    const provider = selectProvider({ task: 'vision' });
    result = await provider.analyzeImage(imageUrl);
  } else {
    // Primary: OpenRouter → Fallback: OpenAI
    result = await withProviderFallback(
      'process-image-ocr',
      async () => {
        const provider = selectProvider({ task: 'vision' });
        return provider.analyzeImage(imageUrl);
      },
      async () => {
        // Explicit fallback: if primary was OpenRouter and failed, try OpenAI
        if (process.env.OPENAI_API_KEY && process.env.OPENROUTER_API_KEY) {
          console.log('[aiQueue] OpenRouter failed, falling back to OpenAI for vision');
          const fallback = new OpenAIProvider(process.env.OPENAI_API_KEY);
          return fallback.analyzeImage(imageUrl);
        }
        throw new Error('No fallback provider available for vision');
      }
    );
  }

  await job.progress(70);

  const { ocrText, category, tags, sentiment } = result;

  await prisma.entry.update({
    where: { id: entryId },
    data: {
      ocrText,
      category,
      tags,
      sentiment,
    },
  });

  await job.progress(90);

  emitToTrip(tripId, 'entry-updated', {
    entryId,
    ocrText,
    category,
    tags,
    sentiment,
    aiStatus: 'processed',
  });

  await job.progress(100);
  console.log(`[aiQueue] process-image-ocr done — entry ${entryId}, category: ${category}`);
  return { entryId, category, sentiment, tags };
});

// ─── Queue event hooks ────────────────────────────────────────────────────────

aiQueue.on('completed', (job, result) => {
  console.log(`[aiQueue] Job ${job.id} (${job.name}) completed`);
});

aiQueue.on('failed', (job, err) => {
  console.error(`[aiQueue] Job ${job.id} (${job.name}) failed after ${job.attemptsMade} attempts: ${err.message}`);
  // Emit failure so frontend can reflect it
  if (job.data?.tripId && job.data?.entryId) {
    emitToTrip(job.data.tripId, 'entry-updated', {
      entryId:  job.data.entryId,
      aiStatus: 'failed',
      aiError:  err.message,
    });
  }
});

aiQueue.on('stalled', (job) => {
  console.warn(`[aiQueue] Job ${job.id} stalled and will be retried`);
});

module.exports = { aiQueue };
