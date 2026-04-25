/**
 * backend/src/lib/aiProviders.js
 *
 * Unified AI provider interface with three implementations:
 *   - OpenAIProvider   (production: Whisper + GPT-4o)
 *   - GroqProvider     (free/cheap: Whisper-large-v3)
 *   - OpenRouterProvider (free: nova-2-lite / pixtral vision)
 *
 * Each provider implements:
 *   transcribeAudio(audioFilePath) → Promise<string>
 *   analyzeImage(imageUrl)        → Promise<{ ocrText, category, tags, sentiment }>
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { logger } = require('./logger');

// Configurable AI models via env vars
const AI_MODELS = {
  transcribe: process.env.AI_TRANSCRIBE_MODEL || 'whisper-1',
  vision: process.env.AI_VISION_MODEL || 'gpt-4o',
};

// ─── Shared vision prompt ─────────────────────────────────────────────────────

const VISION_PROMPT = `You are analyzing a travel photo. Do ALL of the following:

1. Extract ALL visible text (OCR) — signs, menus, labels, receipts, prices in ¥.
2. Categorize the scene as exactly ONE of: FOOD_DRINK, SIGHTSEEING, ACCOMMODATION, TRANSPORTATION, SHOPPING, TIP_WARNING, MISC
3. List 3–6 descriptive tags (lowercase, no spaces, use underscores).
4. Assess overall sentiment as exactly ONE of: POSITIVE, NEUTRAL, NEGATIVE

Respond ONLY with valid JSON, no markdown, no explanation:
{
  "ocrText": "...",
  "category": "...",
  "tags": ["...", "..."],
  "sentiment": "..."
}`;

// ─── Response parser (shared) ─────────────────────────────────────────────────

function parseVisionResponse(rawText) {
  // Strip possible markdown code fences
  const clean = rawText.replace(/```json|```/gi, '').trim();
  try {
    const parsed = JSON.parse(clean);
    return {
      ocrText:   parsed.ocrText   || '',
      category:  parsed.category  || 'MISC',
      tags:      Array.isArray(parsed.tags) ? parsed.tags : [],
      sentiment: parsed.sentiment || 'NEUTRAL',
    };
  } catch {
    const { logger } = require('./logger');
    logger.warn({ rawText: rawText.slice(0, 200) }, 'Failed to parse vision JSON, using defaults');
    return { ocrText: rawText.slice(0, 500), category: 'MISC', tags: [], sentiment: 'NEUTRAL' };
  }
}

// ─── OpenAI Provider ──────────────────────────────────────────────────────────

class OpenAIProvider {
  constructor(apiKey) {
    if (!apiKey) throw new Error('OpenAIProvider requires OPENAI_API_KEY');
    this.apiKey = apiKey;
    // Lazy-load openai SDK so missing dep doesn't crash if not used
    this._client = null;
  }

  _getClient() {
    if (!this._client) {
      const { OpenAI } = require('openai');
      this._client = new OpenAI({ apiKey: this.apiKey });
    }
    return this._client;
  }

  async transcribeAudio(audioFilePath) {
    const openai = this._getClient();
    const transcription = await openai.audio.transcriptions.create({
      file:  fs.createReadStream(audioFilePath),
      model: 'whisper-1',
    });
    return transcription.text;
  }

  async analyzeImage(imageUrl) {
    const openai = this._getClient();
    const response = await openai.chat.completions.create({
      model: AI_MODELS.vision,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text',      text: VISION_PROMPT },
            { type: 'image_url', image_url: { url: imageUrl, detail: 'low' } },
          ],
        },
      ],
      max_tokens: 400,
    });
    return parseVisionResponse(response.choices[0].message.content);
  }
}

// ─── Groq Provider (audio only) ──────────────────────────────────────────────

class GroqProvider {
  constructor(apiKey) {
    if (!apiKey) throw new Error('GroqProvider requires GROQ_API_KEY');
    this.apiKey = apiKey;
    this.baseUrl = 'https://api.groq.com/openai/v1';
  }

  async transcribeAudio(audioFilePath) {
    // Use form-data package if available, otherwise fall back to node-fetch FormData
    let FormData, Blob;
    try {
      ({ FormData, Blob } = require('node-fetch'));
    } catch {
      // Node 18+ has global FormData / Blob
      FormData = global.FormData;
      Blob = global.Blob;
    }

    const form = new FormData();
    const fileStream = fs.readFileSync(audioFilePath);
    const fileName = path.basename(audioFilePath);
    form.append('file', new Blob([fileStream]), fileName);
    form.append('model', 'whisper-large-v3');
    form.append('response_format', 'json');

    const res = await fetch(`${this.baseUrl}/audio/transcriptions`, {
      method:  'POST',
      headers: { Authorization: `Bearer ${this.apiKey}` },
      body:    form,
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Groq transcription failed (${res.status}): ${err}`);
    }

    const data = await res.json();
    return data.text || '';
  }

  async analyzeImage(_imageUrl) {
    // Groq's vision models (llava) are limited — route vision to OpenRouter instead
    throw new Error('GroqProvider does not support image analysis. Use OpenRouterProvider for vision tasks.');
  }
}

// ─── OpenRouter Provider (vision) ────────────────────────────────────────────

class OpenRouterProvider {
  constructor(apiKey) {
    if (!apiKey) throw new Error('OpenRouterProvider requires OPENROUTER_API_KEY');
    this.apiKey = apiKey;
    this.baseUrl = 'https://openrouter.ai/api/v1';
    // Models tried in order; first that succeeds wins
    this.visionModels = [
      'amazon/nova-2-lite-v1:free',
      'mistralai/pixtral-12b:free',
      'qwen/qwen2.5-vl-72b-instruct:free',
    ];
  }

  async transcribeAudio(_audioFilePath) {
    throw new Error('OpenRouterProvider does not support audio transcription. Use GroqProvider or OpenAIProvider.');
  }

  async analyzeImage(imageUrl) {
    let lastError;

    for (const model of this.visionModels) {
      try {
        const res = await fetch(`${this.baseUrl}/chat/completions`, {
          method:  'POST',
          headers: {
            Authorization:  `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer':  'https://tokyotrip.app',
            'X-Title':       'TokyoTrip Hub',
          },
          body: JSON.stringify({
            model,
            messages: [
              {
                role:    'user',
                content: [
                  { type: 'text',      text: VISION_PROMPT },
                  { type: 'image_url', image_url: { url: imageUrl } },
                ],
              },
            ],
            max_tokens: 400,
          }),
        });

        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`OpenRouter (${model}) failed (${res.status}): ${errText}`);
        }

        const data = await res.json();
        const content = data.choices?.[0]?.message?.content;
        if (!content) throw new Error(`OpenRouter (${model}) returned empty content`);

        logger.info({ model }, 'OpenRouter used model');
        return parseVisionResponse(content);
      } catch (err) {
        logger.warn({ model, error: err.message }, 'OpenRouter model failed');
        lastError = err;
      }
    }

    throw lastError || new Error('All OpenRouter vision models failed');
  }
}

// ─── Mock Provider ────────────────────────────────────────────────────────────

class MockProvider {
  async transcribeAudio(_audioFilePath) {
    await new Promise(r => setTimeout(r, 300)); // simulate latency
    return 'Mock transcription: Great ramen shop near Shinjuku station! The broth was amazing.';
  }

  async analyzeImage(_imageUrl) {
    await new Promise(r => setTimeout(r, 300));
    const categories = ['FOOD_DRINK', 'SIGHTSEEING', 'SHOPPING', 'ACCOMMODATION', 'TRANSPORTATION', 'MISC'];
    const sentiments  = ['POSITIVE', 'POSITIVE', 'POSITIVE', 'NEUTRAL', 'NEGATIVE'];
    return {
      ocrText:   'Mock OCR: ラーメン ¥850 定食 ¥1,200',
      category:  categories[Math.floor(Math.random() * categories.length)],
      tags:      ['tokyo', 'travel', 'japan', 'mock_data'],
      sentiment: sentiments[Math.floor(Math.random() * sentiments.length)],
    };
  }
}

// ─── Provider Factory / Selector ──────────────────────────────────────────────

/**
 * selectProvider({ task: 'transcribe' | 'vision', env: process.env })
 *
 * Priority:
 *   transcribe : Groq → OpenAI → error
 *   vision     : OpenRouter → OpenAI → error
 *
 * MOCK_AI=true overrides everything.
 */
function selectProvider({ task, env = process.env }) {
  if (env.MOCK_AI === 'true') {
    return new MockProvider();
  }

  if (task === 'transcribe') {
    if (env.GROQ_API_KEY) {
      logger.info({ provider: 'GroqProvider' }, 'transcribe → GroqProvider');
      return new GroqProvider(env.GROQ_API_KEY);
    }
    if (env.OPENAI_API_KEY) {
      logger.info({ provider: 'OpenAIProvider' }, 'transcribe → OpenAIProvider');
      return new OpenAIProvider(env.OPENAI_API_KEY);
    }
    throw new Error(
      'No AI provider available for audio transcription. ' +
      'Set GROQ_API_KEY, OPENAI_API_KEY, or MOCK_AI=true.'
    );
  }

  if (task === 'vision') {
    if (env.OPENROUTER_API_KEY) {
      logger.info({ provider: 'OpenRouterProvider' }, 'vision → OpenRouterProvider');
      return new OpenRouterProvider(env.OPENROUTER_API_KEY);
    }
    if (env.OPENAI_API_KEY) {
      logger.info({ provider: 'OpenAIProvider' }, 'vision → OpenAIProvider');
      return new OpenAIProvider(env.OPENAI_API_KEY);
    }
    throw new Error(
      'No AI provider available for image analysis. ' +
      'Set OPENROUTER_API_KEY, OPENAI_API_KEY, or MOCK_AI=true.'
    );
  }

  throw new Error(`Unknown task type: "${task}". Expected "transcribe" or "vision".`);
}

/**
 * withProviderFallback(providerFn, fallbackFn)
 *
 * Wraps a provider call; if it throws, logs the error and tries fallbackFn.
 * Used internally to chain providers when needed.
 */
async function withProviderFallback(label, primaryFn, fallbackFn) {
  try {
    return await primaryFn();
  } catch (err) {
    logger.warn({ label, error: err.message }, 'Primary provider failed, trying fallback');
    return await fallbackFn();
  }
}

module.exports = {
  OpenAIProvider,
  GroqProvider,
  OpenRouterProvider,
  MockProvider,
  selectProvider,
  withProviderFallback,
};
