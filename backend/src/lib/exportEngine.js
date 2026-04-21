/**
 * backend/src/lib/exportEngine.js
 * Core export generation: PDF (Puppeteer), EPUB, Markdown
 */
const path = require('path');
const fs = require('fs');
const { prisma } = require('./prisma');

const EXPORTS_DIR = process.env.EXPORTS_DIR || path.join(__dirname, '../../exports');
if (!fs.existsSync(EXPORTS_DIR)) fs.mkdirSync(EXPORTS_DIR, { recursive: true });

// Cleanup exports older than 24h
function scheduleCleanup(filePath) {
  setTimeout(() => {
    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      console.log(`[exportEngine] Cleaned up: ${filePath}`);
    } catch {}
  }, 24 * 60 * 60 * 1000);
}

// ─── Data Fetching ───────────────────────────────────────────────────────────

async function fetchExportData(tripId, entryIds) {
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: {
      memberships: { include: { user: true } },
      entries: {
        where: entryIds?.length ? { id: { in: entryIds } } : undefined,
        include: { user: true, reactions: true, comments: { include: { user: true } } },
        orderBy: { capturedAt: 'asc' },
      },
    },
  });
  if (!trip) throw new Error('Trip not found');
  return trip;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function groupByDate(entries) {
  const groups = {};
  for (const e of entries) {
    const date = new Date(e.capturedAt).toDateString();
    if (!groups[date]) groups[date] = [];
    groups[date].push(e);
  }
  return Object.entries(groups).map(([date, items]) => ({ date, items }));
}

function extractCosts(entries) {
  const costs = [];
  for (const e of entries) {
    const text = (e.ocrText || '') + ' ' + (e.rawText || '');
    const matches = [...text.matchAll(/[¥￥]([0-9,]+)/g)];
    for (const m of matches) {
      costs.push({
        amount: parseInt(m[1].replace(/,/g, '')),
        label: e.rawText?.slice(0, 60) || e.category || 'Unknown',
        category: e.category,
      });
    }
  }
  return costs;
}

function getTopHighlights(entries, limit = 10) {
  return [...entries]
    .sort((a, b) => {
      const scoreA = (a.reactions?.length || 0) * 2 + (a.sentiment === 'POSITIVE' ? 3 : 0);
      const scoreB = (b.reactions?.length || 0) * 2 + (b.sentiment === 'POSITIVE' ? 3 : 0);
      return scoreB - scoreA;
    })
    .slice(0, limit);
}

const CATEGORY_LABELS = {
  FOOD_DRINK: '🍜 Food & Drink',
  SIGHTSEEING: '🗼 Sightseeing',
  ACCOMMODATION: '🏨 Accommodation',
  TRANSPORTATION: '🚄 Transportation',
  SHOPPING: '🛍️ Shopping',
  TIP_WARNING: '⚠️ Tips & Warnings',
  MISC: '📝 Misc',
};

const SENTIMENT_EMOJI = { POSITIVE: '😊', NEUTRAL: '😐', NEGATIVE: '😟' };

function serverUrl() {
  return process.env.SERVER_URL || 'http://localhost:3001';
}

function entryImageUrl(entry) {
  if (!entry.contentUrl) return null;
  if (entry.contentUrl.startsWith('http')) return entry.contentUrl;
  return `${serverUrl()}${entry.contentUrl}`;
}

// ─── PDF HTML Template ────────────────────────────────────────────────────────

function buildPDFHtml(trip, template) {
  const days = groupByDate(trip.entries);
  const costs = extractCosts(trip.entries);
  const totalCost = costs.reduce((s, c) => s + c.amount, 0);
  const highlights = getTopHighlights(trip.entries);
  const geoEntries = trip.entries.filter(e => e.latitude && e.longitude);

  const byCategory = {};
  for (const e of trip.entries) {
    const cat = e.category || 'MISC';
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(e);
  }

  const isPhotobook = template === 'photobook';
  const isMinimal = template === 'minimal';

  const palette = isMinimal
    ? { bg: '#fafafa', text: '#1a1a1a', accent: '#2563eb', card: '#fff', border: '#e5e7eb' }
    : isPhotobook
    ? { bg: '#0f0f0f', text: '#f5f0e8', accent: '#d4a574', card: '#1a1a1a', border: '#2a2a2a' }
    : { bg: '#fffdf7', text: '#1c1917', accent: '#dc2626', card: '#fff', border: '#f3e8d0' };

  const fontStack = isMinimal
    ? "'Georgia', serif"
    : isPhotobook
    ? "'Playfair Display', 'Georgia', serif"
    : "'Noto Serif', 'Georgia', serif";

  function renderEntry(e) {
    const img = entryImageUrl(e);
    const tags = (e.tags || []).map(t => `<span class="tag">${t}</span>`).join('');
    const sentiment = e.sentiment ? `<span class="sentiment">${SENTIMENT_EMOJI[e.sentiment]}</span>` : '';
    return `
      <div class="entry">
        ${img ? `<img class="entry-img" src="${img}" alt="entry photo" onerror="this.style.display='none'" />` : ''}
        <div class="entry-body">
          <div class="entry-meta">
            <span class="entry-author">${e.user?.name || 'Unknown'}</span>
            <span class="entry-time">${new Date(e.capturedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
            ${sentiment}
            ${e.category ? `<span class="entry-cat">${CATEGORY_LABELS[e.category] || e.category}</span>` : ''}
          </div>
          ${e.rawText ? `<p class="entry-text">${e.rawText}</p>` : ''}
          ${e.transcription ? `<p class="entry-transcription">🎙 ${e.transcription}</p>` : ''}
          ${e.ocrText ? `<p class="entry-ocr">📄 ${e.ocrText}</p>` : ''}
          ${e.address ? `<p class="entry-loc">📍 ${e.address}</p>` : ''}
          ${tags ? `<div class="tags">${tags}</div>` : ''}
        </div>
      </div>`;
  }

  const dayPages = days.map(({ date, items }) => `
    <div class="page day-page">
      <div class="day-header">
        <h2>${new Date(date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</h2>
        <span class="day-count">${items.length} moment${items.length !== 1 ? 's' : ''}</span>
      </div>
      ${items.map(renderEntry).join('')}
    </div>`).join('');

  const tocItems = Object.entries(byCategory)
    .filter(([, v]) => v.length > 0)
    .map(([cat, items]) => `<li><span class="toc-cat">${CATEGORY_LABELS[cat] || cat}</span><span class="toc-count">${items.length} entries</span></li>`)
    .join('');

  const highlightCards = highlights.map(e => `
    <div class="highlight-card">
      ${entryImageUrl(e) ? `<img src="${entryImageUrl(e)}" onerror="this.style.display='none'" />` : ''}
      <p>${(e.rawText || e.transcription || 'Memory').slice(0, 120)}${(e.rawText || '').length > 120 ? '…' : ''}</p>
      <span class="hl-reactions">❤️ ${e.reactions?.length || 0}</span>
    </div>`).join('');

  const costRows = costs.slice(0, 20).map(c =>
    `<tr><td>${c.label.slice(0, 50)}</td><td>${CATEGORY_LABELS[c.category] || '—'}</td><td class="amount">¥${c.amount.toLocaleString()}</td></tr>`
  ).join('');

  const mapScript = geoEntries.length > 0 ? `
    <script>
      window.onload = function() {
        var map = L.map('map-container').setView([${geoEntries[0].latitude}, ${geoEntries[0].longitude}], 13);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap'
        }).addTo(map);
        var entries = ${JSON.stringify(geoEntries.map(e => ({
          lat: e.latitude, lng: e.longitude,
          text: (e.rawText || '').slice(0, 80),
          cat: e.category,
        })))};
        entries.forEach(function(e) {
          L.circleMarker([e.lat, e.lng], { radius: 8, fillColor: '#dc2626', color: '#fff', weight: 2, fillOpacity: 0.9 })
            .bindPopup('<b>' + (e.cat || 'Entry') + '</b><br>' + e.text)
            .addTo(map);
        });
      };
    </script>` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${trip.title}</title>
${geoEntries.length > 0 ? '<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" /><script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>' : ''}
<style>
  @import url('https://fonts.googleapis.com/css2?family=Noto+Serif:wght@400;700&family=Playfair+Display:ital,wght@0,400;0,700;1,400&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: ${fontStack};
    background: ${palette.bg};
    color: ${palette.text};
    font-size: 13px;
    line-height: 1.7;
  }

  .page {
    padding: 48px 56px;
    min-height: 297mm;
    page-break-after: always;
    position: relative;
  }

  /* ── Cover ── */
  .cover {
    background: ${isPhotobook ? 'linear-gradient(160deg, #0f0f0f 0%, #1a1209 100%)' : isMinimal ? '#fff' : 'linear-gradient(160deg, #1c1917 0%, #44170f 100%)'};
    color: ${isPhotobook || !isMinimal ? '#f5f0e8' : '#1a1a1a'};
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    text-align: center;
    gap: 24px;
  }
  .cover-emoji { font-size: 72px; }
  .cover h1 { font-size: 48px; font-weight: 700; letter-spacing: -1px; }
  .cover .subtitle { font-size: 20px; opacity: 0.7; font-style: italic; }
  .cover .meta { font-size: 14px; opacity: 0.6; }
  .cover .participants { margin-top: 16px; font-size: 15px; }
  .cover-line { width: 80px; height: 2px; background: ${palette.accent}; }

  /* ── TOC ── */
  .toc h2 { font-size: 28px; margin-bottom: 32px; border-bottom: 2px solid ${palette.accent}; padding-bottom: 12px; }
  .toc ul { list-style: none; }
  .toc li { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid ${palette.border}; }
  .toc-cat { font-size: 15px; }
  .toc-count { color: ${palette.accent}; font-size: 13px; }

  /* ── Days ── */
  .day-header { margin-bottom: 28px; }
  .day-header h2 { font-size: 26px; color: ${palette.accent}; }
  .day-count { font-size: 12px; opacity: 0.5; }

  .entry {
    display: flex;
    gap: 16px;
    margin-bottom: 28px;
    padding: 16px;
    background: ${palette.card};
    border: 1px solid ${palette.border};
    border-radius: 8px;
    page-break-inside: avoid;
  }
  .entry-img { width: 160px; min-width: 160px; height: 120px; object-fit: cover; border-radius: 6px; }
  .entry-body { flex: 1; }
  .entry-meta { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-bottom: 8px; font-size: 12px; opacity: 0.7; }
  .entry-author { font-weight: 700; }
  .entry-cat { background: ${palette.accent}; color: #fff; padding: 2px 8px; border-radius: 12px; font-size: 11px; }
  .entry-text { font-size: 14px; margin-bottom: 6px; }
  .entry-transcription, .entry-ocr { font-size: 12px; opacity: 0.65; font-style: italic; margin-bottom: 4px; }
  .entry-loc { font-size: 12px; opacity: 0.55; }
  .tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
  .tag { background: ${palette.border}; padding: 2px 8px; border-radius: 10px; font-size: 11px; }
  .sentiment { font-size: 16px; }

  /* ── Highlights ── */
  .highlights h2 { font-size: 28px; margin-bottom: 24px; color: ${palette.accent}; }
  .highlights-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; }
  .highlight-card { border: 1px solid ${palette.border}; border-radius: 8px; overflow: hidden; page-break-inside: avoid; }
  .highlight-card img { width: 100%; height: 140px; object-fit: cover; }
  .highlight-card p { padding: 12px; font-size: 13px; }
  .hl-reactions { padding: 0 12px 12px; font-size: 12px; display: block; }

  /* ── Map ── */
  .map-section h2 { font-size: 28px; margin-bottom: 24px; color: ${palette.accent}; }
  #map-container { width: 100%; height: 400px; border-radius: 8px; border: 1px solid ${palette.border}; }
  .no-geo { padding: 48px; text-align: center; opacity: 0.4; background: ${palette.card}; border-radius: 8px; }

  /* ── Costs ── */
  .costs h2 { font-size: 28px; margin-bottom: 24px; color: ${palette.accent}; }
  .costs table { width: 100%; border-collapse: collapse; }
  .costs th { text-align: left; padding: 10px 12px; background: ${palette.card}; border-bottom: 2px solid ${palette.accent}; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; }
  .costs td { padding: 10px 12px; border-bottom: 1px solid ${palette.border}; font-size: 13px; }
  .amount { text-align: right; font-weight: 700; color: ${palette.accent}; }
  .total-row td { font-weight: 700; font-size: 15px; border-top: 2px solid ${palette.accent}; }

  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
${mapScript}
</head>
<body>

<!-- COVER -->
<div class="page cover">
  <div class="cover-emoji">✈️</div>
  <div class="cover-line"></div>
  <h1>${trip.title}</h1>
  <p class="subtitle">${trip.destination}</p>
  ${trip.startDate ? `<p class="meta">${new Date(trip.startDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })} — ${trip.endDate ? new Date(trip.endDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : 'Ongoing'}</p>` : ''}
  <div class="cover-line"></div>
  <p class="participants">
    ${trip.memberships.map(m => m.user.name).join(' · ')}
  </p>
  <p class="meta" style="margin-top:32px">${trip.entries.length} moments captured</p>
</div>

<!-- TABLE OF CONTENTS -->
<div class="page toc">
  <h2>Contents</h2>
  <ul>${tocItems}</ul>
  <p style="margin-top:32px; opacity:0.5; font-size:12px">
    ${days.length} day${days.length !== 1 ? 's' : ''} • 
    ${trip.entries.filter(e => e.type === 'PHOTO').length} photos • 
    ${trip.entries.filter(e => e.type === 'VOICE').length} voice memos
  </p>
</div>

<!-- DAY BY DAY -->
${dayPages}

<!-- TOP HIGHLIGHTS -->
${highlights.length > 0 ? `
<div class="page highlights">
  <h2>⭐ Top Highlights</h2>
  <div class="highlights-grid">
    ${highlightCards}
  </div>
</div>` : ''}

<!-- MAP -->
<div class="page map-section">
  <h2>🗺️ Journey Map</h2>
  ${geoEntries.length > 0
    ? `<div id="map-container"></div>`
    : `<div class="no-geo"><p>No geolocated entries found</p></div>`}
</div>

<!-- COST SUMMARY -->
${costs.length > 0 ? `
<div class="page costs">
  <h2>💴 Cost Summary</h2>
  <table>
    <thead><tr><th>Item</th><th>Category</th><th>Amount</th></tr></thead>
    <tbody>
      ${costRows}
      <tr class="total-row">
        <td colspan="2">Total</td>
        <td class="amount">¥${totalCost.toLocaleString()}</td>
      </tr>
    </tbody>
  </table>
</div>` : ''}

</body>
</html>`;
}

// ─── PDF Generation ───────────────────────────────────────────────────────────

async function generatePDF(trip, template, jobId) {
  let puppeteer;
  try {
    puppeteer = require('puppeteer');
  } catch {
    throw new Error('puppeteer not installed. Run: npm install puppeteer');
  }

  const html = buildPDFHtml(trip, template);
  const outFile = path.join(EXPORTS_DIR, `export-${jobId}.pdf`);

   const browser = await puppeteer.launch({
     executablePath: process.env.CHROME_PATH || '/usr/bin/chromium-browser',
     headless: 'new',
     args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
   });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 60000 });
    // Wait for Leaflet map if present
    if (trip.entries.some(e => e.latitude)) {
      await page.waitForTimeout(2000);
    }
    await page.pdf({
      path: outFile,
      format: 'A4',
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    });
  } finally {
    await browser.close();
  }

  scheduleCleanup(outFile);
  return outFile;
}

// ─── EPUB Generation ──────────────────────────────────────────────────────────

async function generateEPUB(trip, template, jobId) {
  const JSZip = require('jszip');
  const days = groupByDate(trip.entries);
  const highlights = getTopHighlights(trip.entries);

  const zip = new JSZip();

  // mimetype (must be first, uncompressed)
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });

  // META-INF/container.xml
  zip.folder('META-INF').file('container.xml', `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:schemas:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`);

  const oebps = zip.folder('OEBPS');

  // Build chapter files
  const chapters = [];

  // Cover chapter
  const coverContent = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml">
<head><title>${trip.title}</title><link rel="stylesheet" href="styles.css"/></head>
<body class="cover">
  <h1>${trip.title}</h1>
  <p class="destination">${trip.destination}</p>
  ${trip.startDate ? `<p class="dates">${new Date(trip.startDate).toLocaleDateString()}</p>` : ''}
  <p class="participants">${trip.memberships.map(m => m.user.name).join(', ')}</p>
</body></html>`;
  oebps.file('cover.xhtml', coverContent);
  chapters.push({ id: 'cover', title: 'Cover', file: 'cover.xhtml' });

  // Day chapters
  days.forEach(({ date, items }, idx) => {
    const chId = `day-${idx}`;
    const dateStr = new Date(date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    const entriesHtml = items.map(e => `
      <div class="entry">
        ${entryImageUrl(e) ? `<img src="${entryImageUrl(e)}" alt="entry" class="entry-img"/>` : ''}
        <p class="meta">${e.user?.name || ''} · ${new Date(e.capturedAt).toLocaleTimeString()}</p>
        ${e.rawText ? `<p>${e.rawText}</p>` : ''}
        ${e.transcription ? `<p class="sub">🎙 ${e.transcription}</p>` : ''}
        ${e.address ? `<p class="loc">📍 ${e.address}</p>` : ''}
      </div>`).join('');

    oebps.file(`${chId}.xhtml`, `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml">
<head><title>${dateStr}</title><link rel="stylesheet" href="styles.css"/></head>
<body><h1>${dateStr}</h1>${entriesHtml}</body></html>`);
    chapters.push({ id: chId, title: dateStr, file: `${chId}.xhtml` });
  });

  // Highlights chapter
  if (highlights.length > 0) {
    const hlHtml = highlights.map(e => `
      <div class="entry">
        ${entryImageUrl(e) ? `<img src="${entryImageUrl(e)}" alt="highlight" class="entry-img"/>` : ''}
        <p>${(e.rawText || e.transcription || '').slice(0, 200)}</p>
        <p class="meta">❤️ ${e.reactions?.length || 0} reactions</p>
      </div>`).join('');
    oebps.file('highlights.xhtml', `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml">
<head><title>Highlights</title><link rel="stylesheet" href="styles.css"/></head>
<body><h1>⭐ Top Highlights</h1>${hlHtml}</body></html>`);
    chapters.push({ id: 'highlights', title: 'Highlights', file: 'highlights.xhtml' });
  }

  // CSS
  oebps.file('styles.css', `
body { font-family: Georgia, serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1c1917; }
h1 { font-size: 2em; margin-bottom: 0.5em; color: #dc2626; }
.cover { text-align: center; padding-top: 40%; }
.destination { font-size: 1.3em; font-style: italic; }
.entry { margin: 24px 0; padding: 16px; border-left: 3px solid #dc2626; }
.entry-img { max-width: 100%; height: auto; border-radius: 6px; margin: 8px 0; }
.meta { font-size: 0.8em; color: #888; }
.sub { font-style: italic; color: #555; }
.loc { color: #888; font-size: 0.85em; }
`);

  // content.opf
  const manifestItems = chapters.map(ch =>
    `<item id="${ch.id}" href="${ch.file}" media-type="application/xhtml+xml"/>`
  ).join('\n    ');
  const spineItems = chapters.map(ch => `<itemref idref="${ch.id}"/>`).join('\n    ');

  oebps.file('content.opf', `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>${trip.title}</dc:title>
    <dc:language>en</dc:language>
    <dc:identifier id="uid">${trip.id}</dc:identifier>
    <dc:creator>${trip.memberships.map(m => m.user.name).join(', ')}</dc:creator>
    <dc:subject>Travel</dc:subject>
    <meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')}</meta>
  </metadata>
  <manifest>
    <item id="css" href="styles.css" media-type="text/css"/>
    ${manifestItems}
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
  </manifest>
  <spine toc="ncx">
    ${spineItems}
  </spine>
</package>`);

  // toc.ncx
  const navPoints = chapters.map((ch, i) => `
    <navPoint id="navpoint-${i}" playOrder="${i + 1}">
      <navLabel><text>${ch.title}</text></navLabel>
      <content src="${ch.file}"/>
    </navPoint>`).join('');

  oebps.file('toc.ncx', `<?xml version="1.0" encoding="utf-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head><meta name="dtb:uid" content="${trip.id}"/></head>
  <docTitle><text>${trip.title}</text></docTitle>
  <navMap>${navPoints}</navMap>
</ncx>`);

  const outFile = path.join(EXPORTS_DIR, `export-${jobId}.epub`);
  const buffer = await zip.generateAsync({ type: 'nodebuffer', mimeType: 'application/epub+zip' });
  fs.writeFileSync(outFile, buffer);
  scheduleCleanup(outFile);
  return outFile;
}

// ─── Markdown Generation ──────────────────────────────────────────────────────

async function generateMarkdown(trip, jobId) {
  const days = groupByDate(trip.entries);
  const highlights = getTopHighlights(trip.entries);
  const costs = extractCosts(trip.entries);

  let md = `---
title: "${trip.title}"
destination: "${trip.destination}"
startDate: ${trip.startDate ? new Date(trip.startDate).toISOString().split('T')[0] : 'unknown'}
endDate: ${trip.endDate ? new Date(trip.endDate).toISOString().split('T')[0] : 'unknown'}
participants: [${trip.memberships.map(m => `"${m.user.name}"`).join(', ')}]
totalEntries: ${trip.entries.length}
exportedAt: ${new Date().toISOString()}
---

# ${trip.title}
📍 ${trip.destination}

> *${trip.memberships.map(m => m.user.name).join(', ')}*

---

`;

  for (const { date, items } of days) {
    md += `## ${new Date(date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}\n\n`;
    for (const e of items) {
      md += `### ${new Date(e.capturedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} — ${e.user?.name || 'Unknown'}\n\n`;
      if (e.category) md += `**Category:** ${CATEGORY_LABELS[e.category] || e.category}  \n`;
      if (e.sentiment) md += `**Sentiment:** ${SENTIMENT_EMOJI[e.sentiment]} ${e.sentiment}  \n`;
      if (e.rawText) md += `\n${e.rawText}\n`;
      if (e.transcription) md += `\n> 🎙 *${e.transcription}*\n`;
      if (e.ocrText) md += `\n> 📄 *${e.ocrText}*\n`;
      if (e.contentUrl) md += `\n![Entry media](${entryImageUrl(e)})\n`;
      if (e.address) md += `\n📍 ${e.address}\n`;
      if (e.tags?.length) md += `\n**Tags:** ${e.tags.map(t => `\`${t}\``).join(' ')}\n`;
      md += '\n---\n\n';
    }
  }

  if (highlights.length > 0) {
    md += `## ⭐ Top Highlights\n\n`;
    for (const e of highlights) {
      md += `- **${e.user?.name}**: ${(e.rawText || e.transcription || '').slice(0, 100)} *(❤️ ${e.reactions?.length || 0})*\n`;
    }
    md += '\n';
  }

  if (costs.length > 0) {
    md += `## 💴 Cost Summary\n\n| Item | Category | Amount |\n|------|----------|--------|\n`;
    for (const c of costs.slice(0, 20)) {
      md += `| ${c.label.slice(0, 40)} | ${CATEGORY_LABELS[c.category] || '—'} | ¥${c.amount.toLocaleString()} |\n`;
    }
    const total = costs.reduce((s, c) => s + c.amount, 0);
    md += `| **Total** | | **¥${total.toLocaleString()}** |\n\n`;
  }

  const outFile = path.join(EXPORTS_DIR, `export-${jobId}.md`);
  fs.writeFileSync(outFile, md, 'utf8');
  scheduleCleanup(outFile);
  return outFile;
}

// ─── Main Export Dispatcher ───────────────────────────────────────────────────

async function generateExport({ tripId, format, template, entryIds, jobId }) {
  const trip = await fetchExportData(tripId, entryIds);

  let filePath;
  if (format === 'PDF') {
    filePath = await generatePDF(trip, template || 'default', jobId);
  } else if (format === 'EPUB') {
    filePath = await generateEPUB(trip, template || 'default', jobId);
  } else if (format === 'MARKDOWN') {
    filePath = await generateMarkdown(trip, jobId);
  } else {
    throw new Error(`Unsupported format: ${format}`);
  }

  const ext = { PDF: 'pdf', EPUB: 'epub', MARKDOWN: 'md' }[format];
  const downloadUrl = `/api/export/${jobId}/download`;

  return { filePath, downloadUrl, format, ext };
}

module.exports = { generateExport, EXPORTS_DIR };
