import { useState, useEffect } from 'react';
import { api } from '../lib/api';

/**
 * EntryCard — displays a single feed entry.
 *
 * Phase 2 additions:
 *  - Shows "Transcribing…" / "Analyzing photo…" while AI processing is pending
 *  - Listens to `entry-processed` Socket.io events and refreshes status
 *  - Renders transcription, ocrText, category, tags, sentiment when available
 */
export default function EntryCard({ entry: initialEntry, currentUserId, socket, onDelete }) {
  const [entry, setEntry] = useState(initialEntry);
  const [processing, setProcessing] = useState(
    (initialEntry.type === 'VOICE' && !initialEntry.transcription) ||
    (initialEntry.type === 'PHOTO' && !initialEntry.ocrText && !initialEntry.category)
  );
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState('');

  // Listen for real-time AI processing completion
  useEffect(() => {
    if (!socket || !processing) return;

    function handleProcessed(data) {
      if (data.entryId !== entry.id) return;
      setEntry((prev) => ({ ...prev, ...data }));
      setProcessing(false);
    }

    socket.on('entry-processed', handleProcessed);
    return () => socket.off('entry-processed', handleProcessed);
  }, [socket, processing, entry.id]);

  // Fallback polling if socket event is missed (every 5s, max 60s)
  useEffect(() => {
    if (!processing) return;
    let attempts = 0;
    const interval = setInterval(async () => {
      attempts++;
      try {
        const status = await api.getEntryStatus(entry.id);
        if (!status.processing) {
          setEntry((prev) => ({ ...prev, ...status }));
          setProcessing(false);
        }
      } catch { /* ignore */ }
      if (attempts >= 12) clearInterval(interval);
    }, 5000);
    return () => clearInterval(interval);
  }, [processing, entry.id]);

  async function handleReaction(emoji) {
    try {
      const updated = await api.toggleReaction(entry.id, emoji);
      setEntry((prev) => ({ ...prev, reactions: updated.reactions }));
    } catch (err) {
      console.error(err);
    }
  }

  async function handleComment(e) {
    e.preventDefault();
    if (!commentText.trim()) return;
    try {
      const comment = await api.addComment(entry.id, commentText.trim());
      setEntry((prev) => ({ ...prev, comments: [...(prev.comments || []), comment] }));
      setCommentText('');
    } catch (err) {
      console.error(err);
    }
  }

  const isOwner = entry.userId === currentUserId;
  const REACTIONS = ['❤️', '😂', '🔥', '👍', '😮'];
  const SENTIMENT_ICON = { POSITIVE: '😊', NEUTRAL: '😐', NEGATIVE: '😟' };

  return (
    <div className="entry-card">
       {/* Header */}
       <div className="entry-header">
         <div className="avatar">
           <span>{entry.user?.name?.[0] ?? '?'}</span>
         </div>
         <span className="username">{entry.user?.name ?? 'Unknown'}</span>
         <div className="entry-time">
           {new Date(entry.capturedAt).toLocaleString()}
         </div>
         {isOwner && (
           <button
             className="entry-delete"
             onClick={() => onDelete?.(entry.id)}
             title="Delete"
           >
             ✕
           </button>
         )}
       </div>

      {/* Content */}
      {entry.type === 'TEXT' && (
        <p className="entry-text">{entry.rawText}</p>
      )}

      {entry.type === 'PHOTO' && entry.contentUrl && (
        <img
          src={entry.contentUrl}
          alt="Travel photo"
          className="entry-photo"
          loading="lazy"
        />
      )}

      {entry.type === 'VOICE' && entry.contentUrl && (
        <audio controls src={entry.contentUrl} className="entry-audio" />
      )}

      {/* AI Processing states */}
      {entry.type === 'VOICE' && processing && (
        <div className="entry-ai-pending">
          <span className="spinner" /> Transcribing…
        </div>
      )}

      {entry.type === 'PHOTO' && processing && (
        <div className="entry-ai-pending">
          <span className="spinner" /> Analyzing photo…
        </div>
      )}

      {/* Transcription result */}
      {entry.transcription && (
        <div className="entry-transcription">
          <span className="entry-label">Transcription</span>
          <p>{entry.transcription}</p>
        </div>
      )}

      {/* OCR / Photo analysis */}
      {entry.ocrText && (
        <div className="entry-ocr">
          <span className="entry-label">Extracted text</span>
          <p>{entry.ocrText}</p>
        </div>
      )}

      {/* Category + Sentiment + Tags */}
      {(entry.category || entry.sentiment || entry.tags?.length > 0) && (
        <div className="entry-meta-row">
          {entry.category && (
            <span className="entry-badge entry-badge--category">
              {entry.category.replace('_', ' ')}
            </span>
          )}
          {entry.sentiment && (
            <span className="entry-badge entry-badge--sentiment" title={entry.sentiment}>
              {SENTIMENT_ICON[entry.sentiment]}
            </span>
          )}
          {entry.tags?.map((tag) => (
            <span key={tag} className="entry-badge entry-badge--tag">#{tag}</span>
          ))}
        </div>
      )}

      {/* Reactions */}
      <div className="entry-reactions">
        {REACTIONS.map((emoji) => {
          const count = entry.reactions?.filter((r) => r.emoji === emoji).length ?? 0;
          return (
            <button
              key={emoji}
              className={`reaction-btn ${count > 0 ? 'reaction-btn--active' : ''}`}
              onClick={() => handleReaction(emoji)}
            >
              {emoji} {count > 0 && <span>{count}</span>}
            </button>
          );
        })}
      </div>

      {/* Comments toggle */}
      <button
        className="entry-comments-toggle"
        onClick={() => setShowComments((v) => !v)}
      >
        💬 {entry.comments?.length ?? 0} comment{entry.comments?.length !== 1 ? 's' : ''}
      </button>

      {showComments && (
        <div className="entry-comments">
          {entry.comments?.map((c) => (
            <div key={c.id} className="comment">
              <strong>{c.user?.name}</strong>: {c.text}
            </div>
          ))}
          <form onSubmit={handleComment} className="comment-form">
            <input
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="Add a comment…"
              className="comment-input"
            />
            <button type="submit" className="comment-submit">Post</button>
          </form>
        </div>
      )}
    </div>
  );
}