# Hotfix: Multi-Provider AI Pipeline — Migration Guide

## New / Changed Files

| File | Status | What changed |
|------|--------|--------------|
| `backend/src/lib/aiProviders.js` | **NEW** | Provider interface + OpenAI, Groq, OpenRouter, Mock implementations |
| `backend/src/queues/aiQueue.js` | **MODIFIED** | Removed direct OpenAI calls; uses `selectProvider()` + fallback chain |
| `backend/.env.example` | **MODIFIED** | Added `GROQ_API_KEY`, `OPENROUTER_API_KEY` |

---

## No New npm Packages Required

All three providers use the native `fetch` API (Node 18+).

- **Groq**: plain `fetch` + `FormData` / `Blob` (Node 18 globals)
- **OpenRouter**: plain `fetch` + JSON body
- **OpenAI**: existing `openai` SDK — only loaded if `OPENAI_API_KEY` is set

> Node 16 users: `npm install node-fetch` and update the import in `aiProviders.js`.

---

## Provider Priority

### Audio Transcription
```
MOCK_AI=true   → MockProvider
GROQ_API_KEY   → GroqProvider  (whisper-large-v3, free)
OPENAI_API_KEY → OpenAIProvider (whisper-1, paid)
```

### Image Analysis
```
MOCK_AI=true        → MockProvider
OPENROUTER_API_KEY  → OpenRouterProvider (nova-2-lite → pixtral → qwen2.5-vl, free)
OPENAI_API_KEY      → OpenAIProvider (gpt-4o, paid)
```

Runtime failures automatically fall back to the next provider before Bull retries kick in.

---

## Environment Setup

### Local dev (no keys needed)
```env
MOCK_AI=true
```

### Free real AI
```env
MOCK_AI=false
GROQ_API_KEY=gsk_...
OPENROUTER_API_KEY=sk-or-v1-...
```

### Production with fallback (recommended)
```env
MOCK_AI=false
GROQ_API_KEY=gsk_...
OPENROUTER_API_KEY=sk-or-v1-...
OPENAI_API_KEY=sk-...
```

---

## What Stays the Same

- Socket.io events: `ai-processing`, `entry-updated` — identical
- Bull queue names: `transcribe-audio`, `process-image-ocr` — identical
- Prisma field writes — identical
- `MOCK_AI=true` behavior — identical
- Frontend — zero changes required
- Database schema — no migration needed
