const Queue = require('bull');
const path = require('path');
const fs = require('fs');
const OpenAI = require('openai');
const { prisma } = require('../lib/prisma');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const MOCK_AI = process.env.MOCK_AI === 'true';

const aiQueue = new Queue('ai-processing', REDIS_URL, {
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: true,
    removeOnFail: false,
  },
});

// Helper function to delay execution (for mocking)
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ── Job: transcribe-audio (Whisper) ──────────────────────────────────────────
aiQueue.process('transcribe-audio', async (job) => {
  const { entryId, tripId, contentUrl } = job.data;

  if (MOCK_AI) {
    // Mock transcription after 3 seconds
    await delay(3000);
    const mockTranscription = "This is a mock transcription for testing purposes.";
    
    await prisma.entry.update({
      where: { id: entryId },
      data: { transcription: mockTranscription },
    });

    // Notify connected clients
    const io = global.__io;
    if (io) {
      io.to(`trip:${tripId}`).emit('entry-processed', {
        entryId,
        transcription: mockTranscription,
        processing: false,
      });
    }

    return { entryId, transcription: mockTranscription };
  }

  // Resolve local file path from URL like /uploads/filename.webm
  const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, '..', '..', 'uploads');
  const fileName = path.basename(new URL(contentUrl, 'http://localhost').pathname);
  const filePath = path.join(uploadDir, fileName);

  if (!fs.existsSync(filePath)) {
    throw new Error(`Audio file not found: ${filePath}`);
  }

  const transcription = await openai.audio.transcriptions.create({
    file: fs.createReadStream(filePath),
    model: 'whisper-1',
  });

  await prisma.entry.update({
    where: { id: entryId },
    data: { transcription: transcription.text },
  });

  // Notify connected clients
  const io = global.__io;
  if (io) {
    io.to(`trip:${tripId}`).emit('entry-processed', {
      entryId,
      transcription: transcription.text,
      processing: false,
    });
  }

  return { entryId, transcription: transcription.text };
});

// ── Job: process-image-ocr (GPT-4o Vision) ───────────────────────────────────
aiQueue.process('process-image-ocr', async (job) => {
  const { entryId, tripId, contentUrl } = job.data;

  if (MOCK_AI) {
    // Mock image processing after 3 seconds
    await delay(3000);
    const mockResult = {
      ocrText: "This is mock extracted text from a travel photo.",
      category: "SIGHTSEEING",
      tags: ["mock", "test", "demo"],
      sentiment: "POSITIVE"
    };
    
    await prisma.entry.update({
      where: { id: entryId },
      data: mockResult,
    });

    // Notify connected clients
    const io = global.__io;
    if (io) {
      io.to(`trip:${tripId}`).emit('entry-processed', {
        entryId,
        ocrText: mockResult.ocrText,
        category: mockResult.category,
        tags: mockResult.tags,
        sentiment: mockResult.sentiment,
        processing: false,
      });
    }

    return { entryId, ...mockResult };
  }

  // Build absolute URL for the image if contentUrl is a local path
  const imageUrl = contentUrl.startsWith('http')
    ? contentUrl
    : `${process.env.BASE_URL || 'http://localhost:3001'}${contentUrl}`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    max_tokens: 512,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: { url: imageUrl, detail: 'low' },
          },
          {
            type: 'text',
            text: `Extract all visible text from this travel photo. 
Then respond ONLY with a valid JSON object (no markdown) with this structure:
{
  "ocrText": "extracted text or empty string",
  "category": "one of FOOD_DRINK|SIGHTSEEING|ACCOMMODATION|TRANSPORTATION|SHOPPING|TIP_WARNING|MISC",
  "tags": ["tag1", "tag2", "tag3"],
  "sentiment": "POSITIVE|NEUTRAL|NEGATIVE"
}`,
          },
        ],
      },
    ],
  });

  let parsed = { ocrText: '', category: 'MISC', tags: [], sentiment: 'NEUTRAL' };
  try {
    const raw = response.choices[0].message.content.trim();
    // Strip potential ```json fences
    const clean = raw.replace(/^```json\s*/i, '').replace(/\s*```$/, '');
    parsed = JSON.parse(clean);
  } catch (err) {
    console.error('[aiQueue] Failed to parse GPT-4o response:', err.message);
  }

  // Validate enums
  const validCategories = [
    'FOOD_DRINK', 'SIGHTSEEING', 'ACCOMMODATION',
    'TRANSPORTATION', 'SHOPPING', 'TIP_WARNING', 'MISC',
  ];
  const validSentiments = ['POSITIVE', 'NEUTRAL', 'NEGATIVE'];

  const category = validCategories.includes(parsed.category) ? parsed.category : 'MISC';
  const sentiment = validSentiments.includes(parsed.sentiment) ? parsed.sentiment : 'NEUTRAL';
  const tags = Array.isArray(parsed.tags) ? parsed.tags.slice(0, 5) : [];
  const ocrText = typeof parsed.ocrText === 'string' ? parsed.ocrText : '';

  await prisma.entry.update({
    where: { id: entryId },
    data: { ocrText, category, tags, sentiment },
  });

  const io = global.__io;
  if (io) {
    io.to(`trip:${tripId}`).emit('entry-processed', {
      entryId,
      ocrText,
      category,
      tags,
      sentiment,
      processing: false,
    });
  }

  return { entryId, ocrText, category, tags, sentiment };
});

// ── Error logging ─────────────────────────────────────────────────────────────
aiQueue.on('failed', (job, err) => {
  console.error(`[aiQueue] Job ${job.name} #${job.id} failed:`, err.message);
});

module.exports = aiQueue;