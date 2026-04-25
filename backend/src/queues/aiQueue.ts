import 'dotenv/config';
import Bull from 'bull';
import path from 'path';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { selectProvider, withProviderFallback, GroqProvider, OpenAIProvider, OpenRouterProvider } from '../lib/aiProviders';
import { redisClient, redisPub } from '../lib/redis';

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

const { io: globalIo } = global.__io ? { io: global.__io } : { io: null };

const CHANNEL = 'tokyotrip:notifications';

function emitToTrip(tripId: string, event: string, payload: unknown) {
  redisPub.publish(CHANNEL, JSON.stringify({ tripId, event, payload }));
}

async function markEntryStatus(entryId: string, status: string, extra: Record<string, unknown> = {}) {
  await prisma.entry.update({
    where: { id: entryId },
    data:  { ...extra },
  });
}

aiQueue.process('transcribe-audio', async (job) => {
  const { entryId, tripId, audioFilePath } = job.data;
  logger.info({ jobId: job.id, entryId }, 'Processing transcribe-audio job');

  await job.progress(10);
  emitToTrip(tripId, 'ai-processing', { entryId, status: 'processing', task: 'transcribe' });

  let transcription;

  if (process.env.MOCK_AI === 'true') {
    const provider = selectProvider({ task: 'transcribe' });
    transcription = await provider.transcribeAudio(audioFilePath);
  } else {
    transcription = await withProviderFallback(
      'transcribe-audio',
      async () => {
        const provider = selectProvider({ task: 'transcribe' });
        return provider.transcribeAudio(audioFilePath);
      },
      async () => {
        if (process.env.OPENAI_API_KEY && process.env.GROQ_API_KEY) {
          logger.warn('Groq failed, falling back to OpenAI for transcription');
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

  emitToTrip(tripId, 'entry-updated', {
    entryId,
    transcription,
    rawText: transcription,
    aiStatus: 'transcribed',
  });

  await job.progress(100);
  logger.info({ jobId: job.id, entryId }, 'transcribe-audio job completed');
  return { entryId, transcription };
});

aiQueue.process('process-image-ocr', async (job) => {
  const { entryId, tripId, imageUrl } = job.data;
  logger.info({ jobId: job.id, entryId }, 'Processing process-image-ocr job');

  await job.progress(10);
  emitToTrip(tripId, 'ai-processing', { entryId, status: 'processing', task: 'vision' });

  let result;

  if (process.env.MOCK_AI === 'true') {
    const provider = selectProvider({ task: 'vision' });
    result = await provider.analyzeImage(imageUrl);
  } else {
    result = await withProviderFallback(
      'process-image-ocr',
      async () => {
        const provider = selectProvider({ task: 'vision' });
        return provider.analyzeImage(imageUrl);
      },
      async () => {
        if (process.env.OPENAI_API_KEY && process.env.OPENROUTER_API_KEY) {
          logger.warn('OpenRouter failed, falling back to OpenAI for vision');
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
  logger.info({ jobId: job.id, entryId, category }, 'process-image-ocr job completed');
  return { entryId, category, sentiment, tags };
});

aiQueue.on('completed', (job, result) => {
  logger.info({ jobId: job.id, jobName: job.name }, 'Job completed');
});

aiQueue.on('failed', (job, err) => {
  logger.error({ jobId: job.id, jobName: job.name, attempts: job.attemptsMade, error: err.message }, 'Job failed');
  if (job.data?.tripId && job.data?.entryId) {
    emitToTrip(job.data.tripId, 'entry-updated', {
      entryId:  job.data.entryId,
      aiStatus: 'failed',
      aiError:  err.message,
    });
  }
});

aiQueue.on('stalled', (job) => {
  logger.warn({ jobId: job.id }, 'Job stalled and will be retried');
});

export { aiQueue };
