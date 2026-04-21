import { useState, useRef } from 'react';
import { api } from '../lib/api.js';
import { compressImage, buildEntryFormData, getLocation } from '../lib/media.js';

export default function CaptureBar({ user, trip, onEntryCreated }) {
  const [mode, setMode] = useState(null); // null | 'text' | 'photo'
  const [text, setText] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);
  const textRef = useRef(null);

  const openText = () => {
    setMode('text');
    setError('');
    setTimeout(() => textRef.current?.focus(), 50);
  };

  const close = () => {
    setMode(null);
    setText('');
    setError('');
  };

  const submitText = async () => {
    if (!text.trim() || uploading) return;
    setUploading(true);
    setError('');
    try {
      const loc = await getLocation();
      const { entry } = await api.createTextEntry(trip.id, {
        type: 'TEXT',
        rawText: text.trim(),
        capturedAt: new Date().toISOString(),
        ...(loc || {}),
      });
      onEntryCreated({ ...entry, user: { id: user.id, name: user.name, avatar: user.avatar } });
      close();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const handlePhotoSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = ''; // reset input

    setUploading(true);
    setError('');
    setMode('photo');

    try {
      const compressed = await compressImage(file);
      const loc = await getLocation();
      const fd = buildEntryFormData({
        type: 'PHOTO',
        rawText: text.trim() || null,
        file: compressed,
        capturedAt: new Date().toISOString(),
        ...(loc || {}),
      });
      const { entry } = await api.createEntry(trip.id, fd);
      onEntryCreated({ ...entry, user: { id: user.id, name: user.name, avatar: user.avatar } });
      close();
    } catch (err) {
      setError(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      {/* Text compose panel */}
      {mode === 'text' && (
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 20,
          background: 'var(--bg2)', borderTop: '1px solid var(--border)',
          padding: '16px 16px calc(16px + var(--safe-bottom))',
          animation: 'fadeSlideUp 0.2s ease',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text2)' }}>Quick note</span>
            <button onClick={close} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 18 }}>✕</button>
          </div>
          <textarea
            ref={textRef}
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && e.metaKey && submitText()}
            placeholder="What did you find? Tip, food, sight..."
            rows={3}
            style={{
              width: '100%', background: 'var(--bg3)', border: '1px solid var(--border)',
              borderRadius: 12, padding: 12, color: 'var(--text)',
              fontSize: 15, resize: 'none', outline: 'none', lineHeight: 1.5,
              fontFamily: 'DM Sans, sans-serif',
            }}
          />
          {error && <p style={{ fontSize: 12, color: 'var(--accent)', marginTop: 6 }}>{error}</p>}
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button className="btn-ghost" onClick={close} style={{ flex: 1, padding: '12px' }}>Cancel</button>
            <button
              className="btn-primary"
              onClick={submitText}
              disabled={!text.trim() || uploading}
              style={{ flex: 2, padding: '12px' }}
            >
              {uploading ? 'Posting...' : 'Post to Feed ↑'}
            </button>
          </div>
        </div>
      )}

      {/* Uploading overlay */}
      {mode === 'photo' && uploading && (
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 20,
          background: 'var(--bg2)', borderTop: '1px solid var(--border)',
          padding: '20px 16px calc(20px + var(--safe-bottom))',
          display: 'flex', alignItems: 'center', gap: 14,
        }}>
          <div className="spinner" />
          <div>
            <p style={{ fontSize: 14, fontWeight: 500 }}>Uploading photo...</p>
            <p style={{ fontSize: 12, color: 'var(--text3)' }}>Compressed and geotagged</p>
          </div>
        </div>
      )}

      {/* Error from photo */}
      {mode === 'photo' && !uploading && error && (
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 20,
          background: 'var(--bg2)', borderTop: '1px solid var(--border)',
          padding: '16px', display: 'flex', gap: 10, alignItems: 'center',
        }}>
          <p style={{ fontSize: 13, color: 'var(--accent)', flex: 1 }}>{error}</p>
          <button onClick={close} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer' }}>✕</button>
        </div>
      )}

      {/* Main capture bar */}
      {!mode && (
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          background: 'linear-gradient(to top, var(--bg) 70%, transparent)',
          padding: '20px 16px calc(20px + var(--safe-bottom))',
          zIndex: 10,
        }}>
          <div style={{
            background: 'var(--bg3)', border: '1px solid var(--border)',
            borderRadius: 20, padding: '10px 16px',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            {/* Note */}
            <CapButton icon="📝" label="Note" onClick={openText} />

            {/* Voice — Phase 2 */}
            <CapButton icon="🎙" label="Voice" onClick={() => alert('Voice recording coming in Phase 2!')} />

            {/* Camera / Photo — main action */}
            <button
              onClick={() => fileInputRef.current?.click()}
              style={{
                width: 58, height: 58, borderRadius: '50%',
                background: uploading ? 'var(--bg4)' : 'var(--accent)',
                border: '3px solid rgba(255,77,109,0.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 24, cursor: 'pointer', transition: 'transform 0.15s',
                flexShrink: 0,
              }}
              disabled={uploading}
            >
              {uploading ? '⏳' : '📷'}
            </button>

            {/* Location pin */}
            <CapButton icon="📍" label="Place" onClick={() => alert('Map pin coming in Phase 2!')} />

            {/* Video — Phase 2 */}
            <CapButton icon="🎬" label="Video" onClick={() => alert('Video capture coming in Phase 2!')} />
          </div>
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handlePhotoSelect}
        style={{ display: 'none' }}
      />
    </>
  );
}

function CapButton({ icon, label, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1, background: 'none', border: 'none', cursor: 'pointer',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
        color: 'var(--text3)', fontSize: 10, fontFamily: 'DM Sans, sans-serif',
        transition: 'color 0.15s', padding: '4px 0',
        minWidth: 44, minHeight: 48,
      }}
    >
      <div style={{
        width: 44, height: 44, borderRadius: 14,
        background: 'var(--bg4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 20, transition: 'background 0.15s',
      }}>
        {icon}
      </div>
      {label}
    </button>
  );
}
