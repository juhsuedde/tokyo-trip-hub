import { useState } from 'react';

export default function InviteModal({ trip, members, onClose }) {
  const [copied, setCopied] = useState(false);

  const inviteUrl = `${window.location.origin}?join=${trip.inviteCode}`;

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(trip.inviteCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  const shareLink = async () => {
    if (navigator.share) {
      await navigator.share({
        title: `Join ${trip.title} on TokyoTrip Hub`,
        text: `Join our Tokyo trip! Use code: ${trip.inviteCode}`,
        url: inviteUrl,
      });
    } else {
      copyLink();
    }
  };

  const avatarColors = ['#ff4d6d', '#ffd166', '#06d6a0', '#a78bfa', '#60a5fa'];

  return (
    <div
      onClick={onClose}
      style={{
        position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.7)',
        display: 'flex', alignItems: 'flex-end', zIndex: 50,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', background: 'var(--bg2)',
          borderRadius: '24px 24px 0 0',
          borderTop: '1px solid var(--border)',
          padding: '24px 20px calc(32px + var(--safe-bottom))',
          animation: 'fadeSlideUp 0.25s ease',
        }}
      >
        <div style={{ width: 36, height: 4, background: 'var(--border)', borderRadius: 2, margin: '0 auto 20px' }} />

        <h2 className="syne" style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>
          Invite your group
        </h2>
        <p style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 20 }}>
          Share the code or link — no app install needed.
        </p>

        {/* Invite code */}
        <div style={{
          background: 'var(--bg3)', border: '1px solid var(--border)',
          borderRadius: 16, padding: '20px', textAlign: 'center', marginBottom: 12,
        }}>
          <p style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Invite code
          </p>
          <div className="syne" style={{
            fontSize: 36, fontWeight: 800, letterSpacing: '0.2em',
            color: 'var(--accent)',
          }}>
            {trip.inviteCode}
          </div>
          <button
            onClick={copyCode}
            style={{
              marginTop: 12, background: 'var(--bg4)', border: 'none',
              borderRadius: 100, padding: '8px 20px',
              color: copied ? 'var(--accent3)' : 'var(--text2)',
              fontSize: 13, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
              transition: 'color 0.2s',
            }}
          >
            {copied ? '✓ Copied!' : 'Copy code'}
          </button>
        </div>

        {/* Share link button */}
        <button
          className="btn-primary"
          onClick={shareLink}
          style={{ marginBottom: 20 }}
        >
          {navigator.share ? '📤 Share invite link' : '🔗 Copy invite link'}
        </button>

        {/* Current members */}
        <div>
          <p style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>
            {members.length} member{members.length !== 1 ? 's' : ''}
          </p>
          {members.map((m, i) => (
            <div key={m.user?.id || i} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 0', borderBottom: i < members.length - 1 ? '1px solid var(--border)' : 'none',
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: '50%',
                background: avatarColors[i % avatarColors.length],
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 600,
                color: i === 1 || i === 2 ? '#000' : '#fff',
              }}>
                {(m.user?.name || '?').charAt(0).toUpperCase()}
              </div>
              <span style={{ fontSize: 14, fontWeight: 500 }}>{m.user?.name}</span>
              <span style={{
                marginLeft: 'auto', fontSize: 11, color: 'var(--text3)',
                background: 'var(--bg3)', padding: '3px 8px', borderRadius: 100,
              }}>
                {m.role}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
