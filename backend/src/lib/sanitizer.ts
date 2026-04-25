import he from 'html-entities';

function sanitizeHtml(str: string | undefined | null): string | undefined | null {
  if (typeof str !== 'string') return str;
  return he.encode(str);
}

function sanitizeForMarkdown(str: string | undefined | null): string | undefined | null {
  if (typeof str !== 'string') return str;
  return str
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\|/g, '\\|');
}

interface EntryLike {
  rawText?: string | null;
  address?: string | null;
  ocrText?: string | null;
  transcription?: string | null;
}

function sanitizeEntry(entry: EntryLike): EntryLike {
  return {
    ...entry,
    rawText: sanitizeHtml(entry.rawText),
    address: sanitizeHtml(entry.address),
    ocrText: sanitizeHtml(entry.ocrText),
    transcription: sanitizeHtml(entry.transcription),
  };
}

export { sanitizeHtml, sanitizeForMarkdown, sanitizeEntry };