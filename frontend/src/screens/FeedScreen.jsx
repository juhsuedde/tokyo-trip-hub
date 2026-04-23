import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../lib/api.js';
import { useSocket } from '../hooks/useSocket.js';
import EntryCard from '../components/EntryCard.jsx';
import CaptureBar from '../components/CaptureBar.jsx';
import InviteModal from '../components/InviteModal.jsx';

export default function FeedScreen({ user, trip }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [members, setMembers] = useState([]);
  const feedRef = useRef(null);

  // Load initial feed
  useEffect(() => {
    loadFeed();
    api.getMembers(trip.id).then(({ members }) => setMembers(members)).catch(() => {});
  }, [trip.id]);

  async function loadFeed(cursor = null) {
    try {
      if (!cursor) setLoading(true);
      else setLoadingMore(true);

      const { entries: items, pagination } = await api.getFeed(trip.id, cursor);

      setEntries(prev => cursor ? [...prev, ...items] : items);
      setNextCursor(pagination.nextCursor);
      setHasMore(pagination.hasMore);
    } catch (err) {
      console.error('[feed] load error:', err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }

  // Real-time socket events
  useSocket(trip.id, {
     'new-entry': ({ entry }) => {
       // Prepend new entry (skip if already in list — could be our own optimistic)
       if (!entry) return;
       setEntries(prev => {
         if (prev.some(e => e?.id === entry?.id)) return prev;
         return [entry, ...prev];
       });
     },
    'entry-deleted': ({ entryId }) => {
      setEntries(prev => prev.filter(e => e.id !== entryId));
    },
    'reaction-updated': ({ entryId, reactions }) => {
      setEntries(prev => prev.map(e =>
        e.id === entryId ? { ...e, reactions } : e
      ));
    },
    'new-comment': ({ entryId, comment }) => {
      setEntries(prev => prev.map(e => {
        if (e.id !== entryId) return e;
        const comments = [...(e.comments || []), comment].slice(-3);
        return { ...e, comments, _count: { ...e._count, comments: (e._count?.comments || 0) + 1 } };
      }));
    },
     'member-joined': ({ user: newUser }) => {
       if (!newUser) return;
       setMembers(prev => {
         if (prev.some(m => m?.user?.id === newUser?.id)) return prev;
         return [...prev, { user: newUser, role: 'MEMBER', joinedAt: new Date().toISOString() }];
       });
     },
  });

   // Optimistic entry add (from CaptureBar)
   const handleEntryCreated = useCallback((entry) => {
     if (!entry) return;
     setEntries(prev => {
       if (prev.some(e => e?.id === entry?.id)) return prev;
       return [entry, ...prev];
     });
     // Scroll to top
     feedRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
   }, []);

  // Reaction toggle
  const handleReaction = useCallback(async (entryId, emoji) => {
    try {
      const { reactions } = await api.toggleReaction(entryId, emoji);
      setEntries(prev => prev.map(e => e.id === entryId ? { ...e, reactions } : e));
    } catch (err) {
      console.error('[reaction] error:', err);
    }
  }, []);

  // Infinite scroll
  const handleScroll = useCallback(() => {
    if (!feedRef.current || loadingMore || !hasMore) return;
    const { scrollTop, scrollHeight, clientHeight } = feedRef.current;
    if (scrollHeight - scrollTop - clientHeight < 200) {
      loadFeed(nextCursor);
    }
  }, [loadingMore, hasMore, nextCursor]);

  const avatarColors = ['#ff4d6d', '#ffd166', '#06d6a0', '#a78bfa', '#60a5fa'];

  return (
    <div className="feed-screen">
      {/* Header */}
      <div className="feed-header">
        <div className="feed-header-content">
          <div>
            <h1 className="syne feed-title">{trip.title}</h1>
            <p className="feed-dest">{trip.destination}</p>
          </div>
          <div className="feed-header-right">
            <div className="live-pill">
              <span className="live-dot" /> Live
            </div>
            <div className="members-row">
              {members.slice(0, 4).map((m, i) => (
                <div key={m.user?.id || i} className="member-avatar" style={{ background: avatarColors[i % avatarColors.length] }} onClick={() => setShowInvite(true)}>
                  {(m.user?.name || '?').charAt(0).toUpperCase()}
                </div>
              ))}
              <div className="member-avatar invite-btn" onClick={() => setShowInvite(true)}>+</div>
            </div>
          </div>
        </div>
      </div>

      {/* Feed */}
      <div ref={feedRef} className="feed-list" onScroll={handleScroll}>
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)
        ) : entries.length === 0 ? (
          <EmptyFeed />
        ) : (
          entries.map(entry => (
            <EntryCard key={entry.id} entry={entry} currentUser={user} onReaction={handleReaction} />
          ))
        )}
        {loadingMore && <div className="loading-more"><div className="spinner" /></div>}
      </div>

      {/* Capture bar */}
      <CaptureBar tripId={trip.id} onEntryCreated={handleEntryCreated} />

      {/* Invite modal */}
      {showInvite && <InviteModal trip={trip} members={members} onClose={() => setShowInvite(false)} />}
    </div>
  );
}

function SkeletonCard() {
  return (
    <div style={{
      background: 'var(--bg2)', border: '1px solid var(--border)',
      borderRadius: 16, overflow: 'hidden',
    }}>
      <div style={{ height: 140, background: 'var(--bg3)' }} />
      <div style={{ padding: '12px 14px' }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--bg4)' }} />
          <div style={{ width: 80, height: 14, borderRadius: 6, background: 'var(--bg4)' }} />
        </div>
        <div style={{ width: '90%', height: 13, borderRadius: 6, background: 'var(--bg4)', marginBottom: 6 }} />
        <div style={{ width: '60%', height: 13, borderRadius: 6, background: 'var(--bg4)' }} />
      </div>
    </div>
  );
}

function EmptyFeed() {
  return (
    <div style={{ textAlign: 'center', padding: '60px 24px', color: 'var(--text3)' }}>
      <div style={{ fontSize: 48, marginBottom: 12 }}>📸</div>
      <p style={{ fontWeight: 500, color: 'var(--text2)', marginBottom: 6 }}>No entries yet</p>
      <p style={{ fontSize: 13 }}>Be the first to capture something from Tokyo!</p>
    </div>
  );
}
