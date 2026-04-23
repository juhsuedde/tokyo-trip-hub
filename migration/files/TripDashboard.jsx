// frontend/src/screens/TripDashboard.jsx
// Shows the authenticated user's trips, allows creating new ones,
// archiving old ones, and joining by invite code.

import { useState, useEffect } from 'react';
import { api } from '../lib/api.js';
import { useAuth } from '../contexts/AuthContext.jsx';

export default function TripDashboard({ onSelectTrip }) {
  const { user, logout } = useAuth();
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [newTripName, setNewTripName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.get('/trips')
      .then(({ trips }) => setTrips(trips))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  async function createTrip(e) {
    e.preventDefault();
    if (!newTripName.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      const { trip } = await api.post('/trips', { name: newTripName.trim() });
      setTrips(prev => [{ ...trip, role: 'OWNER' }, ...prev]);
      setNewTripName('');
      setShowCreate(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function joinTrip(e) {
    e.preventDefault();
    if (!inviteCode.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      const { trip, role } = await api.post(`/trips/${inviteCode.trim()}/join`, {});
      setTrips(prev => {
        if (prev.find(t => t.id === trip.id)) return prev;
        return [{ ...trip, role }, ...prev];
      });
      setInviteCode('');
      setShowJoin(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function archiveTrip(tripId) {
    try {
      await api.post(`/trips/${tripId}/archive`, {});
      setTrips(prev => prev.filter(t => t.id !== tripId));
    } catch (err) {
      setError(err.message);
    }
  }

  const isPremium = user?.subscription?.tier === 'PREMIUM';
  const atLimit = !isPremium && trips.length >= 3;

  return (
    <div className="dashboard">
      {/* Header */}
      <div className="dash-header">
        <div className="dash-user">
          <div className="dash-avatar">
            {user?.avatarUrl
              ? <img src={user.avatarUrl} alt={user.name} />
              : user?.name?.[0]?.toUpperCase()}
          </div>
          <div>
            <p className="dash-name">{user?.name}</p>
            <p className="dash-tier">{isPremium ? '⭐ Premium' : 'Free plan'}</p>
          </div>
        </div>
        <button className="dash-logout" onClick={logout} type="button">Sign out</button>
      </div>

      <h2 className="dash-section-title">Your Trips</h2>

      {error && <p className="dash-error">{error}</p>}

      {/* Create / Join buttons */}
      <div className="dash-actions">
        <button
          className="dash-btn primary"
          onClick={() => { setShowCreate(true); setShowJoin(false); setError(''); }}
          disabled={atLimit}
          title={atLimit ? 'Upgrade to Premium for unlimited trips' : ''}
        >
          + New Trip
        </button>
        <button
          className="dash-btn secondary"
          onClick={() => { setShowJoin(true); setShowCreate(false); setError(''); }}
        >
          Join by code
        </button>
      </div>

      {atLimit && (
        <p className="dash-limit-notice">
          Free plan: 3 trip maximum reached. Upgrade for unlimited trips.
        </p>
      )}

      {/* Create form */}
      {showCreate && (
        <form onSubmit={createTrip} className="dash-inline-form">
          <input
            autoFocus
            placeholder="Trip name (e.g. Tokyo 2026 🗼)"
            value={newTripName}
            onChange={e => setNewTripName(e.target.value)}
            maxLength={100}
            required
          />
          <button type="submit" disabled={submitting}>
            {submitting ? '…' : 'Create'}
          </button>
          <button type="button" className="cancel" onClick={() => setShowCreate(false)}>✕</button>
        </form>
      )}

      {/* Join form */}
      {showJoin && (
        <form onSubmit={joinTrip} className="dash-inline-form">
          <input
            autoFocus
            placeholder="Paste invite code…"
            value={inviteCode}
            onChange={e => setInviteCode(e.target.value)}
            required
          />
          <button type="submit" disabled={submitting}>
            {submitting ? '…' : 'Join'}
          </button>
          <button type="button" className="cancel" onClick={() => setShowJoin(false)}>✕</button>
        </form>
      )}

      {/* Trip list */}
      {loading ? (
        <p className="dash-loading">Loading trips…</p>
      ) : trips.length === 0 ? (
        <div className="dash-empty">
          <p>No trips yet.</p>
          <p>Create one or join with an invite code.</p>
        </div>
      ) : (
        <ul className="dash-trip-list">
          {trips.map(trip => (
            <li key={trip.id} className="dash-trip-card" onClick={() => onSelectTrip?.(trip)}>
              <div className="dtc-body">
                <p className="dtc-name">{trip.name}</p>
                <p className="dtc-meta">
                  {trip._count?.entries ?? 0} entries · {trip._count?.memberships ?? 1} member
                  {(trip._count?.memberships ?? 1) !== 1 ? 's' : ''} · {trip.role}
                </p>
              </div>
              {trip.role === 'OWNER' && (
                <button
                  className="dtc-archive"
                  onClick={e => { e.stopPropagation(); archiveTrip(trip.id); }}
                  title="Archive trip"
                >
                  📦
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <style>{`
        .dashboard {
          min-height: 100dvh;
          background: #0a0a0a;
          color: #fff;
          padding: 0 0 env(safe-area-inset-bottom);
        }
        .dash-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 20px 16px;
          border-bottom: 1px solid #1a1a1a;
        }
        .dash-user { display: flex; align-items: center; gap: 12px; }
        .dash-avatar {
          width: 40px; height: 40px; border-radius: 50%;
          background: #2a2a2a; display: flex; align-items: center; justify-content: center;
          font-weight: 700; color: #ff4c4c; overflow: hidden; font-size: 1rem;
        }
        .dash-avatar img { width: 100%; height: 100%; object-fit: cover; }
        .dash-name { font-weight: 600; font-size: 0.95rem; margin: 0 0 2px; }
        .dash-tier { color: #666; font-size: 0.75rem; margin: 0; }
        .dash-logout {
          background: none; border: 1px solid #2a2a2a; border-radius: 8px;
          color: #666; cursor: pointer; font-size: 0.8rem; padding: 6px 12px;
        }
        .dash-section-title { padding: 20px 16px 8px; font-size: 1.1rem; font-weight: 700; margin: 0; }
        .dash-error {
          background: rgba(255,76,76,0.1); border: 1px solid rgba(255,76,76,0.3);
          border-radius: 8px; color: #ff6b6b; font-size: 0.85rem; margin: 0 16px 12px;
          padding: 10px 12px;
        }
        .dash-actions { display: flex; gap: 8px; padding: 0 16px 12px; }
        .dash-btn {
          flex: 1; border: none; border-radius: 10px; cursor: pointer;
          font-size: 0.9rem; font-weight: 600; height: 40px;
        }
        .dash-btn.primary { background: #ff4c4c; color: #fff; }
        .dash-btn.primary:disabled { opacity: 0.4; cursor: not-allowed; }
        .dash-btn.secondary { background: #1a1a1a; color: #aaa; border: 1px solid #2a2a2a; }
        .dash-limit-notice {
          color: #888; font-size: 0.78rem; padding: 0 16px 12px; text-align: center;
        }
        .dash-inline-form {
          display: flex; align-items: center; gap: 8px; padding: 0 16px 12px;
        }
        .dash-inline-form input {
          flex: 1; background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 10px;
          color: #fff; font-size: 0.9rem; height: 40px; outline: none; padding: 0 12px;
        }
        .dash-inline-form input:focus { border-color: #ff4c4c; }
        .dash-inline-form button {
          background: #ff4c4c; border: none; border-radius: 8px; color: #fff;
          cursor: pointer; font-size: 0.85rem; font-weight: 600; height: 40px; padding: 0 14px;
          white-space: nowrap;
        }
        .dash-inline-form button.cancel {
          background: #1a1a1a; color: #666; border: 1px solid #222; padding: 0 10px;
        }
        .dash-loading { color: #555; padding: 24px 16px; text-align: center; }
        .dash-empty { color: #555; padding: 32px 16px; text-align: center; line-height: 1.6; }
        .dash-empty p { margin: 0; }
        .dash-trip-list { list-style: none; margin: 0; padding: 0 16px; display: flex; flex-direction: column; gap: 8px; }
        .dash-trip-card {
          background: #141414; border: 1px solid #222; border-radius: 12px;
          cursor: pointer; display: flex; align-items: center; padding: 14px 14px;
          transition: border-color 0.15s;
        }
        .dash-trip-card:active { border-color: #ff4c4c; }
        .dtc-body { flex: 1; min-width: 0; }
        .dtc-name { font-weight: 600; font-size: 0.95rem; margin: 0 0 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .dtc-meta { color: #555; font-size: 0.75rem; margin: 0; }
        .dtc-archive {
          background: none; border: none; cursor: pointer; font-size: 1.1rem;
          padding: 4px 8px; opacity: 0.4; transition: opacity 0.15s;
        }
        .dtc-archive:hover { opacity: 1; }
      `}</style>
    </div>
  );
}
