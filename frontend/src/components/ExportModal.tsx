/**
 * frontend/src/components/ExportModal.jsx
 * Multi-step export wizard: format → template → entries → progress → download
 */
import { useState, useEffect, useRef } from 'react';
import { api } from '../lib/api';
import { Entry } from '../types/index';

// ─── Constants ────────────────────────────────────────────────────────────────

const FORMATS = [
  {
    id: 'PDF',
    icon: '📄',
    name: 'PDF',
    desc: 'Beautifully styled travel guide — perfect for printing or sharing.',
  },
  {
    id: 'EPUB',
    icon: '📚',
    name: 'EPUB',
    desc: 'E-book format for Kindle, Apple Books, or any reader app.',
  },
  {
    id: 'MARKDOWN',
    icon: '✍️',
    name: 'Markdown',
    desc: 'Plain text for Notion, Obsidian, or any note-taking app.',
  },
];

const TEMPLATES = [
  {
    id: 'default',
    icon: '🗾',
    name: 'Default',
    desc: 'Warm travel-guide aesthetic with day-by-day layout.',
  },
  {
    id: 'minimal',
    icon: '⬜',
    name: 'Minimal',
    desc: 'Clean and typographic — great for professional sharing.',
  },
  {
    id: 'photobook',
    icon: '🌃',
    name: 'Photobook',
    desc: 'Dark, cinematic — photos front and center.',
  },
];

const STEPS = ['Format', 'Template', 'Entries', 'Export'];

// ─── Component ────────────────────────────────────────────────────────────────

export default function ExportModal({ tripId, socket, onClose }: { tripId: string; socket: any; onClose: () => void }) {
  const [step, setStep] = useState(0);
  const [format, setFormat] = useState<string | null>(null);
  const [template, setTemplate] = useState<string | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]); // all entries
  const [selectedIds, setSelectedIds] = useState<string[] | null>(null); // null = all
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [exportStatus, setExportStatus] = useState<string | null>(null); // queued/processing/completed/failed
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const pollRef = useRef(null);

   // Load entries for selection step
   useEffect(() => {
     if (step === 2 && entries.length === 0) {
       setLoadingEntries(true);
       async function load() {
         try {
           let all: Entry[] = [];
           let cursor = null;
           do {
             const res = await api.getFeed(tripId, cursor);
             all = all.concat(res.entries || []);
             cursor = res.nextCursor || null;
           } while (cursor);
           setEntries(all);
         } catch (err) {
           console.error('Failed to load entries:', err);
         } finally { setLoadingEntries(false); }
       }
       load();
     }
   }, [step]);

   // Socket.io listener for export-complete
   useEffect(() => {
     if (!socket || !jobId) return;
     function handler(data: { jobId: string; status: string; downloadUrl?: string; error?: string }) {
       if (String(data.jobId) !== String(jobId)) return;
       setExportStatus(data.status as 'queued' | 'processing' | 'completed' | 'failed');
       if (data.status === 'completed') {
         setDownloadUrl(data.downloadUrl ?? null);
         setProgress(100);
         clearPoll();
       } else if (data.status === 'failed') {
         setError(data.error ?? 'Export failed.');
         setDownloadUrl(null);
         clearPoll();
       }
     }
     socket.on('export-complete', handler);
     return () => socket.off('export-complete', handler);
   }, [socket, jobId]);

  // Polling fallback (in case socket misses the event)
  function startPoll(jid) {
    if (pollRef.current) return;
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/export/${jid}/status`, {
          headers: { 'X-Session-Token': localStorage.getItem('sessionToken') || '' },
        });
        const data = await res.json();
        if (data.progress) setProgress(data.progress);
        if (data.status === 'completed') {
          setExportStatus('completed');
          setDownloadUrl(data.downloadUrl);
          setProgress(100);
          clearPoll();
        } else if (data.status === 'failed') {
          setExportStatus('failed');
          setError(data.error || 'Export failed.');
          clearPoll();
        }
      } catch {}
    }, 2500);
  }

  function clearPoll() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  useEffect(() => () => clearPoll(), []);

  // ── Trigger export ──────────────────────────────────────────────────────────
  async function startExport() {
    setExporting(true);
    setError(null);
    setExportStatus('queued');
    setProgress(5);
    try {
      const body = {
        format,
        template,
        ...(selectedIds !== null ? { entryIds: selectedIds } : {}),
      };
      const res = await fetch(`/api/export/trips/${tripId}/export`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('sessionToken') || ''}`,
        },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Export request failed');
      setJobId(data.jobId);
      setStep(3);
      startPoll(data.jobId);
    } catch (err) {
      setError(err.message);
      setExporting(false);
    }
  }

  // ── Selection helpers ───────────────────────────────────────────────────────
  function toggleEntry(id) {
    if (selectedIds === null) {
      // Switch from "all" to custom selection with everything except this one unchecked
      setSelectedIds(entries.map(e => e.id).filter(eid => eid !== id));
    } else if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter(eid => eid !== id));
    } else {
      const next = [...selectedIds, id];
      if (next.length === entries.length) setSelectedIds(null); // back to "all"
      else setSelectedIds(next);
    }
  }

  function isSelected(id) {
    return selectedIds === null || selectedIds.includes(id);
  }

  const selectedCount = selectedIds === null ? entries.length : selectedIds.length;

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div style={s.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={s.modal}>
        {/* Header */}
        <div style={s.header}>
          <span style={s.title}>📖 Export Trip</span>
          <button style={s.closeBtn} onClick={onClose}>✕</button>
        </div>

        {/* Step indicator */}
        <div style={s.steps}>
          {STEPS.map((label, i) => (
            <div key={i} style={s.stepItem}>
              <div style={{ ...s.stepDot, ...(i <= step ? s.stepDotActive : {}) }}>
                {i < step ? '✓' : i + 1}
              </div>
              <span style={{ ...s.stepLabel, ...(i === step ? s.stepLabelActive : {}) }}>{label}</span>
              {i < STEPS.length - 1 && <div style={{ ...s.stepLine, ...(i < step ? s.stepLineActive : {}) }} />}
            </div>
          ))}
        </div>

        <div style={s.body}>
          {/* STEP 0: Format */}
          {step === 0 && (
            <div style={s.cardGrid}>
              <p style={s.stepDesc}>Choose your export format:</p>
              {FORMATS.map(f => (
                <button
                  key={f.id}
                  style={{ ...s.card, ...(format === f.id ? s.cardActive : {}) }}
                  onClick={() => setFormat(f.id)}
                >
                  <span style={s.cardIcon}>{f.icon}</span>
                  <span style={s.cardName}>{f.name}</span>
                  <span style={s.cardDesc}>{f.desc}</span>
                </button>
              ))}
            </div>
          )}

          {/* STEP 1: Template */}
          {step === 1 && (
            <div style={s.cardGrid}>
              <p style={s.stepDesc}>Pick a template style:</p>
              {TEMPLATES.map(t => (
                <button
                  key={t.id}
                  style={{ ...s.card, ...(template === t.id ? s.cardActive : {}) }}
                  onClick={() => setTemplate(t.id)}
                >
                  <span style={s.cardIcon}>{t.icon}</span>
                  <span style={s.cardName}>{t.name}</span>
                  <span style={s.cardDesc}>{t.desc}</span>
                </button>
              ))}
            </div>
          )}

          {/* STEP 2: Entries */}
          {step === 2 && (
            <div>
              <div style={s.entriesHeader}>
                <p style={s.stepDesc}>Select entries to include:</p>
                <div style={s.entriesActions}>
                  <button style={s.linkBtn} onClick={() => setSelectedIds(null)}>All</button>
                  <button style={s.linkBtn} onClick={() => setSelectedIds([])}>None</button>
                </div>
              </div>
              <p style={s.selectedCount}>{selectedCount} of {entries.length} selected</p>
              {loadingEntries ? (
                <div style={s.loadingRow}>
                  <div style={s.miniSpinner} /> Loading entries…
                </div>
              ) : (
                <div style={s.entryList}>
                  {entries.map(e => (
                    <label key={e.id} style={s.entryRow}>
                      <input
                        type="checkbox"
                        checked={isSelected(e.id)}
                        onChange={() => toggleEntry(e.id)}
                        style={s.checkbox}
                      />
                      <div style={s.entryRowContent}>
                        {e.contentUrl && (
                          <img
                            src={e.contentUrl}
                            alt=""
                            style={s.entryThumb}
                            onError={e => e.target.style.display = 'none'}
                          />
                        )}
                        <div style={s.entryRowText}>
                          <span style={s.entryRowMain}>
                            {(e.rawText || e.transcription || e.type || 'Entry').slice(0, 80)}
                          </span>
                          <span style={s.entryRowSub}>
                            {e.user?.name} · {new Date(e.capturedAt).toLocaleDateString()}
                            {e.category ? ` · ${e.category.replace('_', ' ')}` : ''}
                          </span>
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* STEP 3: Progress & Download */}
          {step === 3 && (
            <div style={s.progressWrap}>
              {exportStatus !== 'completed' && exportStatus !== 'failed' && (
                <>
                  <div style={s.exportAnim}>
                    <span style={s.exportIcon}>📖</span>
                  </div>
                  <p style={s.progressTitle}>
                    {exportStatus === 'queued' ? 'Queued…' : 'Building your export…'}
                  </p>
                  <div style={s.progressBar}>
                    <div style={{ ...s.progressFill, width: `${progress}%` }} />
                  </div>
                  <p style={s.progressSub}>
                    Generating {format} with {template} template
                  </p>
                </>
              )}
              {exportStatus === 'completed' && (
                <>
                  <div style={s.successIcon}>✅</div>
                  <p style={s.progressTitle}>Export ready!</p>
                  <a
                    href={downloadUrl}
                    download
                    style={s.downloadBtn}
                    onClick={onClose}
                  >
                    ⬇️ Download {format}
                  </a>
                </>
              )}
              {exportStatus === 'failed' && (
                <>
                  <div style={s.errorIcon}>❌</div>
                  <p style={s.progressTitle}>Export failed</p>
                  <p style={s.errorMsg}>{error}</p>
                  <button style={s.retryBtn} onClick={() => { setStep(0); setError(null); setExporting(false); }}>
                    Try again
                  </button>
                </>
              )}
            </div>
          )}

          {error && step !== 3 && (
            <p style={s.errorBanner}>{error}</p>
          )}
        </div>

        {/* Footer nav */}
        {step < 3 && (
          <div style={s.footer}>
            {step > 0 ? (
              <button style={s.backBtn} onClick={() => setStep(s => s - 1)}>← Back</button>
            ) : (
              <div />
            )}
            {step < 2 ? (
              <button
                style={{ ...s.nextBtn, ...((step === 0 && !format) || (step === 1 && !template) ? s.nextBtnDisabled : {}) }}
                disabled={(step === 0 && !format) || (step === 1 && !template)}
                onClick={() => setStep(s => s + 1)}
              >
                Next →
              </button>
            ) : (
              <button
                style={{ ...s.nextBtn, ...(selectedCount === 0 ? s.nextBtnDisabled : {}) }}
                disabled={selectedCount === 0 || exporting}
                onClick={startExport}
              >
                {exporting ? 'Starting…' : '🚀 Generate Export'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
// Uses CSS vars from index.css for dark-mode consistency

const s = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.8)',
    backdropFilter: 'blur(6px)',
    WebkitBackdropFilter: 'blur(6px)',
    display: 'flex',
    alignItems: 'flex-end', // sheet from bottom on mobile
    justifyContent: 'center',
    zIndex: 9999,
    padding: '0',
  },
  modal: {
    background: 'var(--bg2)',
    border: '1px solid var(--border)',
    // Bottom sheet: full width, rounded top corners only
    borderRadius: '20px 20px 0 0',
    width: '100%',
    maxWidth: 560,
    // On larger screens center it
    maxHeight: 'calc(92vh - env(safe-area-inset-top, 0px))',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    boxShadow: '0 -8px 40px rgba(0,0,0,0.6)',
    // Drag handle hint
    paddingTop: 8,
    animation: 'fadeSlideUp 0.28s cubic-bezier(0.32, 0.72, 0, 1) both',
    paddingBottom: 'env(safe-area-inset-bottom, 0px)',
  },
  // Drag handle
  dragHandle: {
    width: 40,
    height: 4,
    background: 'var(--border)',
    borderRadius: 2,
    margin: '0 auto 10px',
    flexShrink: 0,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '4px 20px 14px',
    borderBottom: '1px solid var(--border)',
    flexShrink: 0,
  },
  title: { color: 'var(--text)', fontSize: 17, fontWeight: 700, letterSpacing: '-0.3px', fontFamily: 'Syne, sans-serif' },
  closeBtn: {
    background: 'var(--bg3)',
    border: 'none',
    color: 'var(--text2)',
    fontSize: 16,
    cursor: 'pointer',
    lineHeight: 1,
    // 44x44 touch target
    width: 36,
    height: 36,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  steps: {
    display: 'flex',
    alignItems: 'center',
    padding: '14px 20px',
    borderBottom: '1px solid var(--border)',
    gap: 0,
    flexShrink: 0,
  },
  stepItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  stepDot: {
    width: 24,
    height: 24,
    borderRadius: '50%',
    background: 'var(--bg4)',
    color: 'var(--text3)',
    fontSize: 11,
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s',
    flexShrink: 0,
  },
  stepDotActive: {
    background: 'var(--accent)',
    color: '#fff',
  },
  stepLabel: {
    fontSize: 12,
    color: 'var(--text3)',
    transition: 'color 0.2s',
  },
  stepLabelActive: { color: 'var(--text2)' },
  stepLine: {
    flex: 1,
    height: 1,
    background: 'var(--border)',
    margin: '0 8px',
    width: 24,
    transition: 'background 0.2s',
  },
  stepLineActive: { background: 'var(--accent)' },
  body: {
    flex: 1,
    overflowY: 'auto',
    padding: '20px',
    WebkitOverflowScrolling: 'touch',
  },
  stepDesc: { color: 'var(--text3)', fontSize: 13, marginBottom: 14 },
  cardGrid: { display: 'flex', flexDirection: 'column', gap: 10 },
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    padding: '14px 16px',
    background: 'var(--bg3)',
    border: '1.5px solid var(--border)',
    borderRadius: 12,
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'all 0.15s',
    minHeight: 72, // comfortable touch area
  },
  cardActive: {
    borderColor: 'var(--accent)',
    background: 'rgba(255,77,109,0.08)',
  },
  cardIcon: { fontSize: 22, marginBottom: 2 },
  cardName: { color: 'var(--text)', fontWeight: 700, fontSize: 15 },
  cardDesc: { color: 'var(--text3)', fontSize: 13, lineHeight: 1.4 },
  entriesHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  entriesActions: { display: 'flex', gap: 8 },
  linkBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--accent)',
    fontSize: 13,
    cursor: 'pointer',
    padding: '8px 4px',
    minHeight: 44,
    fontFamily: 'DM Sans, sans-serif',
  },
  selectedCount: { color: 'var(--text3)', fontSize: 12, marginBottom: 10 },
  entryList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    maxHeight: '40vh',
    overflowY: 'auto',
    WebkitOverflowScrolling: 'touch',
  },
  entryRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '10px 12px',
    borderRadius: 10,
    cursor: 'pointer',
    background: 'var(--bg3)',
    border: '1px solid var(--border)',
    minHeight: 52, // touch target
  },
  checkbox: { width: 18, height: 18, flexShrink: 0, accentColor: 'var(--accent)' },
  entryRowContent: { display: 'flex', gap: 8, alignItems: 'center', flex: 1, minWidth: 0 },
  entryThumb: {
    width: 40,
    height: 40,
    objectFit: 'cover',
    borderRadius: 6,
    flexShrink: 0,
  },
  entryRowText: { flex: 1, minWidth: 0 },
  entryRowMain: {
    display: 'block',
    color: 'var(--text2)',
    fontSize: 13,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  entryRowSub: {
    display: 'block',
    color: 'var(--text3)',
    fontSize: 11,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  loadingRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    color: 'var(--text3)',
    fontSize: 13,
    padding: 16,
  },
  miniSpinner: {
    width: 16,
    height: 16,
    border: '2px solid var(--border)',
    borderTop: '2px solid var(--accent)',
    borderRadius: '50%',
    animation: 'spin 0.7s linear infinite',
    flexShrink: 0,
  },
  progressWrap: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    padding: '28px 0',
    minHeight: 200,
    textAlign: 'center',
  },
  exportAnim: {
    animation: 'pulse 1.2s ease-in-out infinite',
  },
  exportIcon: { fontSize: 52 },
  progressTitle: { color: 'var(--text)', fontWeight: 600, fontSize: 17 },
  progressBar: {
    width: '100%',
    maxWidth: 280,
    height: 6,
    background: 'var(--bg4)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    background: 'linear-gradient(90deg, var(--accent), var(--accent2))',
    borderRadius: 3,
    transition: 'width 0.5s ease',
  },
  progressSub: { color: 'var(--text3)', fontSize: 13 },
  successIcon: { fontSize: 48 },
  downloadBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '13px 28px',
    background: 'var(--accent)',
    color: '#fff',
    borderRadius: 100,
    textDecoration: 'none',
    fontWeight: 700,
    fontSize: 15,
    marginTop: 8,
    minHeight: 48,
    fontFamily: 'DM Sans, sans-serif',
  },
  errorIcon: { fontSize: 48 },
  errorMsg: { color: '#f87171', fontSize: 14, maxWidth: 300 },
  retryBtn: {
    padding: '12px 24px',
    background: 'var(--bg3)',
    border: '1px solid var(--border)',
    color: 'var(--text2)',
    borderRadius: 10,
    cursor: 'pointer',
    fontSize: 14,
    fontFamily: 'DM Sans, sans-serif',
    minHeight: 48,
  },
  errorBanner: {
    marginTop: 12,
    padding: '10px 14px',
    background: 'rgba(255,77,109,0.08)',
    border: '1px solid rgba(255,77,109,0.3)',
    borderRadius: 10,
    color: '#f87171',
    fontSize: 13,
  },
  footer: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 20px',
    borderTop: '1px solid var(--border)',
    flexShrink: 0,
    gap: 12,
  },
  backBtn: {
    padding: '12px 18px',
    background: 'none',
    border: '1px solid var(--border)',
    color: 'var(--text3)',
    borderRadius: 10,
    cursor: 'pointer',
    fontSize: 14,
    fontFamily: 'DM Sans, sans-serif',
    minHeight: 48,
  },
  nextBtn: {
    flex: 1,
    padding: '12px 22px',
    background: 'var(--accent)',
    border: 'none',
    color: '#fff',
    borderRadius: 10,
    cursor: 'pointer',
    fontWeight: 700,
    fontSize: 15,
    transition: 'opacity 0.15s',
    fontFamily: 'DM Sans, sans-serif',
    minHeight: 48,
  },
  nextBtnDisabled: {
    opacity: 0.4,
    cursor: 'not-allowed',
  },
};
