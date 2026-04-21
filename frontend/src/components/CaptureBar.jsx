import { useState, useRef } from 'react';
import { api } from '../lib/api';

/**
 * CaptureBar — text, photo, and voice entry creation.
 *
 * Voice recording:
 *  - Tap mic icon to start recording (MediaRecorder, audio/webm)
 *  - Tap again to stop and upload as type: VOICE
 *  - Falls back to offline queue if network unavailable
 */
export default function CaptureBar({ tripId, onEntryCreated }) {
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Voice state
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);

  // ── Text entry ──────────────────────────────────────────────────────────────
  async function handleTextSubmit(e) {
    e.preventDefault();
    if (!text.trim() || submitting) return;
    setSubmitting(true);
    try {
      const entry = await api.createTextEntry(tripId, { type: 'TEXT', rawText: text.trim() });
      setText('');
      onEntryCreated?.(entry);
    } catch (err) {
      console.error('Text entry failed:', err);
    } finally {
      setSubmitting(false);
    }
  }

  // ── Photo entry ─────────────────────────────────────────────────────────────
  async function handlePhoto(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('type', 'PHOTO');
      const entry = await api.createEntry(tripId, fd);
      onEntryCreated?.(entry);
    } catch (err) {
      console.error('Photo upload failed:', err);
    } finally {
      setSubmitting(false);
      e.target.value = '';
    }
  }

  // ── Voice recording ─────────────────────────────────────────────────────────
  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';
      const mr = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];

      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: mimeType });
        await uploadVoice(blob, mimeType);
      };

      mr.start(250); // collect chunks every 250ms
      mediaRecorderRef.current = mr;
      setRecording(true);
      setRecordingSeconds(0);
      timerRef.current = setInterval(() => setRecordingSeconds((s) => s + 1), 1000);
    } catch (err) {
      console.error('Could not access microphone:', err);
      alert('Microphone access denied. Please allow microphone permissions.');
    }
  }

  function stopRecording() {
    clearInterval(timerRef.current);
    mediaRecorderRef.current?.stop();
    setRecording(false);
    setRecordingSeconds(0);
  }

  async function uploadVoice(blob, mimeType) {
    setSubmitting(true);
    try {
      const ext = mimeType.includes('mp4') ? 'm4a' : 'webm';
      const file = new File([blob], `voice-${Date.now()}.${ext}`, { type: mimeType });
      const fd = new FormData();
      fd.append('file', file);
      fd.append('type', 'VOICE');
      const entry = await api.createEntry(tripId, fd);
      onEntryCreated?.(entry);
    } catch (err) {
      console.error('Voice upload failed:', err);
    } finally {
      setSubmitting(false);
    }
  }

  function formatTime(s) {
    const m = Math.floor(s / 60).toString().padStart(2, '0');
    const sec = (s % 60).toString().padStart(2, '0');
    return `${m}:${sec}`;
  }

  return (
    <div className="capture-bar">
      {/* Recording indicator */}
      {recording && (
        <div className="recording-indicator">
          <span className="rec-dot" /> Recording… {formatTime(recordingSeconds)}
        </div>
      )}

      <form onSubmit={handleTextSubmit} className="capture-form">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Add a note…"
          disabled={submitting || recording}
          className="capture-input"
        />

        {/* Send text */}
        <button
          type="submit"
          disabled={!text.trim() || submitting || recording}
          className="capture-btn"
          title="Send note"
        >
          ✈
        </button>

        {/* Photo upload */}
        <label className="capture-btn" title="Add photo" style={{ cursor: 'pointer' }}>
          📷
          <input
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handlePhoto}
            disabled={submitting || recording}
          />
        </label>

        {/* Voice recording */}
        <button
          type="button"
          className={`capture-btn ${recording ? 'capture-btn--recording' : ''}`}
          onClick={recording ? stopRecording : startRecording}
          disabled={submitting && !recording}
          title={recording ? 'Stop recording' : 'Record voice memo'}
        >
          {recording ? '⏹' : '🎙'}
        </button>
      </form>
    </div>
  );
}