const he = require('html-entities');

function sanitizeHtml(str) {
  if (typeof str !== 'string') return str;
  return he.encode(str);
}

function sanitizeForMarkdown(str) {
  if (typeof str !== 'string') return str;
  return str
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\|/g, '\\|');
}

function sanitizeEntry(entry) {
  return {
    ...entry,
    rawText: sanitizeHtml(entry.rawText),
    address: sanitizeHtml(entry.address),
    ocrText: sanitizeHtml(entry.ocrText),
    transcription: sanitizeHtml(entry.transcription),
  };
}

module.exports = { sanitizeHtml, sanitizeForMarkdown, sanitizeEntry };