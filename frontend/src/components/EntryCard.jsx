import { useState } from 'react';
import { api } from '../lib/api.js';

const CATEGORY_META = {
  FOOD_DRINK:     { label: 'Food & Drink',    bg: '#3d1f2a', color: '#f0997b' },
  SIGHTSEEING:    { label: 'Sightseeing',     bg: '#0d1a2a', color: '#85b7eb' },
  SHOPPING:       { label: 'Shopping',        bg: '#1a2a1a', color: '#97c459' },
  TIP_WARNING:    { label: 'Tip / Warning',   bg: '#2a2a14', color: '#ffd166' },
  ACCOMMODATION:  { label: 'Accommodation',   bg: '#1a1a30', color: '#a78bfa' },
  TRANSPORTATION: { label: 'Transport',       bg: '#1a2a1a', color: '#06d6a0' },
  MISC:           { label: 'Misc',            bg: '#2a2a2a', color: '#9998b8' },
};

const TYPE_EMOJI = { TEXT: '💬', PHOTO: '📷', VOICE: '🎙', VIDEO: '🎬', LOCATION: '📍' };
const AVATAR_COLORS = ['#ff4d6d', '#ffd166', '#06d6a0', '#a78bfa', '#60a5fa'];

function getAvatarColor(name) {
  let hash = 0;
  for (const c of (name || '?')) hash = c.charCodeAt(0) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

const QUICK_EMOJIS = ['❤️', '😍', '🔥', '👍', '😮'];

export default function EntryCard({ entry, currentUser, onReaction }) {
  const [showEmojis, setShowEmojis] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [showComments, setShowComments] = useState(false);
  const [submittingComment, setSubmittingComment] = useState(false);

  const cat = CATEGORY_META[entry.category] || null;
  const avatarColor = getAvatarColor(entry.user?.name);
  const isDarkAvatar = avatarColor === '#ffd166' || avatarColor === '#06d6a0';

  // Group reactions by emoji
  const reactionGroups = (entry.reactions || []).reduce((acc, r) => {
    acc[r.emoji] = acc[r.emoji] || { emoji: r.emoji, count: 0, hasMe: false, users: [] };
    acc[r.emoji].count++;
    acc[r.emoji].users.push(r.user?.name);
    if (r.user?.id === currentUser?.id) acc[r.emoji].hasMe = true;
    return acc;
  }, {});

  const handleReact = (emoji) => {
    setShowEmojis(false);
    onReaction(entry.id, emoji);
  };

  const handleComment = async () => {
    if (!commentText.trim() || submittingComment) return;
    setSubmittingComment(true);
    try {
      await api.addComment(entry.id, commentText.trim());
      setCommentText('');
    } catch (err) {
      console.error('[comment] error:', err);
    } finally {
      setSubmittingComment(false);
    }
  };

  const timeAgo = (iso) => {
    const diff = Date.now() - new Date(iso).getTime();
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return new Date(iso).toLocaleDateString('en', { month: 'short', day: 'numeric' });
  };

  return (
    <div style={{
      background: 'var(--bg2)', border: '1px solid var(--border)',
      borderRadius: 16, overflow: 'hidden',
      animation: 'fadeSlideUp 0.3s ease both',
    }}>
      {/* Media */}
      {entry.type === 'PHOTO' && entry.contentUrl && (
        <img
          src={entry.contentUrl}
          alt="Trip photo"
          loading="lazy"
          style={{ width: '100%', height: 200, objectFit: 'cover', display: 'block', background: 'var(--bg4)' }}
        />
      )}

      {entry.type === 'VOICE' && entry.contentUrl && (
        <div style={{ padding: '12px 14px 0' }}>
          <audio controls src={entry.contentUrl} style={{ width: '100%', height: 36 }} />
        </div>
      )}

      {entry.type === 'VIDEO' && entry.contentUrl && (
        <video
          controls
          src={entry.contentUrl}
          style={{ width: '100%', maxHeight: 240, background: '#000' }}
        />
      )}

      <div style={{ padding: '12px 14px' }}>
        {/* Meta row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <div style={{
            width: 26, height: 26, borderRadius: '50%',
            background: avatarColor, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 10, fontWeight: 600,
            color: isDarkAvatar ? '#000' : '#fff',
          }}>
            {(entry.user?.name || '?').charAt(0).toUpperCase()}
          </div>
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>
            {entry.user?.name || 'Unknown'}
          </span>
          {cat && (
            <span style={{
              fontSize: 10, padding: '2px 8px', borderRadius: 100,
              background: cat.bg, color: cat.color,
            }}>
              {cat.label}
            </span>
          )}
          {!cat && (
            <span style={{ fontSize: 12 }}>{TYPE_EMOJI[entry.type] || '📝'}</span>
          )}
          <span style={{ fontSize: 11, color: 'var(--text3)', marginLeft: 'auto', flexShrink: 0 }}>
            {timeAgo(entry.createdAt)}
          </span>
        </div>

        {/* Text content */}
        {entry.rawText && (
          <p style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.6, marginBottom: 8 }}>
            {entry.rawText}
          </p>
        )}

        {/* Transcription (voice entries) */}
        {entry.transcription && (
          <p style={{
            fontSize: 13, color: 'var(--text2)', lineHeight: 1.55,
            borderLeft: '2px solid var(--border)', paddingLeft: 10,
            fontStyle: 'italic', marginBottom: 8,
          }}>
            "{entry.transcription}"
            <span style={{ fontSize: 10, color: 'var(--text3)', display: 'block', marginTop: 3 }}>
              ✦ AI transcription
            </span>
          </p>
        )}

        {/* Tags */}
        {entry.tags?.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
            {entry.tags.map(tag => (
              <span key={tag} style={{
                fontSize: 11, background: 'var(--bg3)', color: 'var(--text2)',
                padding: '2px 8px', borderRadius: 100,
              }}>
                #{tag}
              </span>
            ))}
          </div>
        )}

        {/* Location */}
        {entry.address && (
          <p style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 4 }}>
            📍 {entry.address}
          </p>
        )}

        {/* Reactions + actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', position: 'relative' }}>
          {Object.values(reactionGroups).map(({ emoji, count, hasMe }) => (
            <button
              key={emoji}
              onClick={() => handleReact(emoji)}
              style={{
                background: hasMe ? 'rgba(255,77,109,0.15)' : 'var(--bg3)',
                border: hasMe ? '1px solid rgba(255,77,109,0.4)' : '1px solid transparent',
                borderRadius: 100, padding: '4px 10px',
                fontSize: 13, color: hasMe ? 'var(--accent)' : 'var(--text2)',
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                fontFamily: 'DM Sans, sans-serif',
              }}
            >
              {emoji} {count}
            </button>
          ))}

          {/* Add reaction */}
          <button
            onClick={() => setShowEmojis(v => !v)}
            style={{
              background: 'var(--bg3)', border: 'none', borderRadius: 100,
              padding: '4px 10px', fontSize: 14, color: 'var(--text3)',
              cursor: 'pointer',
            }}
          >
            {showEmojis ? '✕' : '＋'}
          </button>

          {/* Comments toggle */}
          <button
            onClick={() => setShowComments(v => !v)}
            style={{
              background: 'none', border: 'none', color: 'var(--text3)',
              fontSize: 12, cursor: 'pointer', marginLeft: 'auto',
              display: 'flex', alignItems: 'center', gap: 4,
              fontFamily: 'DM Sans, sans-serif',
            }}
          >
            💬 {entry._count?.comments || 0}
          </button>

          {/* Quick emoji picker */}
          {showEmojis && (
            <div style={{
              position: 'absolute', top: -48, left: 0,
              background: 'var(--bg3)', border: '1px solid var(--border)',
              borderRadius: 100, padding: '6px 12px',
              display: 'flex', gap: 8, zIndex: 5,
              boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
            }}>
              {QUICK_EMOJIS.map(e => (
                <button
                  key={e}
                  onClick={() => handleReact(e)}
                  style={{
                    background: 'none', border: 'none', fontSize: 20,
                    cursor: 'pointer', padding: '2px 4px',
                    transition: 'transform 0.1s',
                  }}
                  onMouseDown={el => el.target.style.transform = 'scale(1.3)'}
                  onMouseUp={el => el.target.style.transform = 'scale(1)'}
                >
                  {e}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Comments section */}
        {showComments && (
          <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
            {entry.comments?.map(c => (
              <div key={c.id} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <div style={{
                  width: 22, height: 22, borderRadius: '50%',
                  background: getAvatarColor(c.user?.name),
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 9, fontWeight: 600, color: '#fff', flexShrink: 0,
                }}>
                  {(c.user?.name || '?').charAt(0).toUpperCase()}
                </div>
                <div>
                  <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)' }}>{c.user?.name} </span>
                  <span style={{ fontSize: 12, color: 'var(--text2)' }}>{c.text}</span>
                  <span style={{ fontSize: 10, color: 'var(--text3)', display: 'block' }}>{timeAgo(c.createdAt)}</span>
                </div>
              </div>
            ))}
            {entry._count?.comments > 3 && (
              <p style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 8 }}>
                View all {entry._count.comments} comments
              </p>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={commentText}
                onChange={e => setCommentText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleComment()}
                placeholder="Add a comment..."
                style={{ flex: 1, padding: '8px 12px', fontSize: 13 }}
              />
              <button
                onClick={handleComment}
                disabled={!commentText.trim() || submittingComment}
                style={{
                  background: 'var(--accent)', border: 'none', borderRadius: 10,
                  color: '#fff', padding: '8px 14px', cursor: 'pointer',
                  fontSize: 13, opacity: !commentText.trim() ? 0.4 : 1,
                }}
              >
                →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
