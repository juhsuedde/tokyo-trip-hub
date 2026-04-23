import { useState, useEffect } from 'react';
import { api } from '../lib/api.js';

export default function OnboardScreen({ user, onComplete, onLogout }) {
  const [step, setStep] = useState('start');
  const [trips, setTrips] = useState([]);
  const [tripTitle, setTripTitle] = useState('Tokyo Spring 2026');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showConfirmLeave, setShowConfirmLeave] = useState(null);

  useEffect(() => {
    if (user) {
      loadTrips();
    }
  }, []);

  async function loadTrips() {
    try {
      const { trips } = await api.getTrips();
      setTrips(trips || []);
    } catch (err) {
      console.error('Failed to load trips:', err);
    }
  }

  async function handleTripAction(fn) {
    setError('');
    setLoading(true);
    try {
      const result = await fn();
      await loadTrips();
      onComplete(user, result.trip);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSelectTrip(trip) {
    onComplete(user, trip);
  }

  async function confirmLeaveTrip(tripId) {
    setShowConfirmLeave(tripId);
  }

  async function executeLeaveTrip() {
    try {
      await api.leaveTrip(showConfirmLeave);
      // Success - close modal and reload
      setShowConfirmLeave(null);
      await loadTrips();
    } catch (err) {
      // Show error but keep modal open so user can see it
      setError(err.message);
      // Keep modal open to show error
    }
  }

  async function handleCreate() {
    if (!tripTitle.trim()) throw new Error('Trip name is required');
    return api.createTrip({
      title: tripTitle.trim(),
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    });
  }

  async function handleJoin() {
    if (!inviteCode.trim()) throw new Error('Enter the invite code');
    return api.joinTrip(inviteCode.trim().toUpperCase());
  }

  const inputStyle = { marginBottom: 12 };

  // My Trips screen
  if (step === 'trips' || (step === 'start' && trips.length > 0)) {
    return (
      <div style={shell}>
        {showConfirmLeave && (
          <ConfirmModal
            tripTitle={trips.find(t => t.id === showConfirmLeave)?.title}
            onConfirm={executeLeaveTrip}
            onCancel={() => { setShowConfirmLeave(null); setError(''); }}
            error={error}
          />
        )}
        
        <h2 className="syne" style={{ fontSize: 24, fontWeight: 700, marginBottom: 6 }}>
          My <span style={{ color: 'var(--accent)' }}>Trips</span>
        </h2>
        
        <div style={{ marginBottom: 24 }}>
          {trips.map(trip => (
            <div key={trip.id} style={tripCard}>
              <div onClick={() => handleSelectTrip(trip)} style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 4 }}>
                  {trip.title}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 4 }}>
                  {trip.startDate ? new Date(trip.startDate).toLocaleDateString() : 'No date'}
                  {trip.endDate && ` - ${new Date(trip.endDate).toLocaleDateString()}`}
                </div>
                <div style={{ fontSize: 13, color: 'var(--accent)' }}>
                  Code: <strong>{trip.inviteCode}</strong>
                </div>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); confirmLeaveTrip(trip.id); }}
                style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', padding: 8, fontSize: 18 }}
              >
                ×
              </button>
            </div>
          ))}
        </div>

        <button className="btn-ghost" onClick={onLogout} style={{ marginTop: 16 }}>Logout</button>
        <button className="btn-primary" onClick={() => setStep('create')} style={{ marginBottom: 10 }}>Create New Trip</button>
        <button className="btn-ghost" onClick={() => setStep('join')}>Join with Code</button>
      </div>
    );
  }

  // Start screen
  if (step === 'start') {
    return (
      <div style={shell}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>🗾</div>
          <h1 className="syne" style={{ fontSize: 28, fontWeight: 800, letterSpacing: -1 }}>
            TokyoTrip<span style={{ color: 'var(--accent)' }}>Hub</span>
          </h1>
          <p style={{ color: 'var(--text3)', marginTop: 6, fontSize: 13 }}>Group travel · Capture · Remember</p>
        </div>

        {user && (
          <p style={{ textAlign: 'center', color: 'var(--text2)', fontSize: 14, marginBottom: 24 }}>
            Welcome, <strong>{user.name}</strong>!
          </p>
        )}

        <button className="btn-primary" onClick={() => trips.length > 0 ? setStep('trips') : setStep('create')} style={{ marginBottom: 10 }}>
          {trips.length > 0 ? 'My Trips' : 'Create a Trip'}
        </button>
        <button className="btn-ghost" onClick={() => setStep('join')}>Join with Invite Code</button>
        <button className="btn-ghost" onClick={onLogout} style={{ marginTop: 16 }}>Logout</button>
      </div>
    );
  }

  // Create trip screen
  if (step === 'create') {
    return (
      <div style={shell}>
        <button onClick={() => setStep('start')} style={backBtn}>←</button>
        <h2 className="syne" style={{ fontSize: 24, fontWeight: 700, marginBottom: 6 }}>
          Plan your <span style={{ color: 'var(--accent)' }}>adventure</span>
        </h2>
        <p style={{ color: 'var(--text3)', fontSize: 13, marginBottom: 24 }}>
          You'll get an invite code to share with your group.
        </p>

        <label style={labelStyle}>Trip name</label>
        <input value={tripTitle} onChange={e => setTripTitle(e.target.value)} placeholder="Tokyo Spring 2026" style={inputStyle} />

        <label style={labelStyle}>Dates (optional)</label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
        </div>

        {error && <p style={errorStyle}>{error}</p>}

        <div style={{ marginTop: 'auto', paddingTop: 24 }}>
          <button className="btn-primary" onClick={() => handleTripAction(handleCreate)} disabled={loading}>
            {loading ? 'Creating...' : 'Create Trip & Get Invite Code'}
          </button>
        </div>
      </div>
    );
  }

  // Join trip screen
  if (step === 'join') {
    return (
      <div style={shell}>
        <button onClick={() => setStep('start')} style={backBtn}>←</button>
        <h2 className="syne" style={{ fontSize: 24, fontWeight: 700, marginBottom: 6 }}>
          Join a <span style={{ color: 'var(--accent)' }}>trip</span>
        </h2>
        <p style={{ color: 'var(--text3)', fontSize: 13, marginBottom: 24 }}>
          Enter the 6-character invite code from your group.
        </p>

        <label style={labelStyle}>Invite code</label>
        <input
          value={inviteCode}
          onChange={e => setInviteCode(e.target.value.toUpperCase())}
          placeholder="TOKYO1"
          maxLength={6}
          style={{ ...inputStyle, textTransform: 'uppercase', letterSpacing: '0.2em', fontSize: 20, textAlign: 'center' }}
        />

        {error && <p style={errorStyle}>{error}</p>}

        <div style={{ marginTop: 'auto', paddingTop: 24 }}>
          <button className="btn-primary" onClick={() => handleTripAction(handleJoin)} disabled={loading}>
            {loading ? 'Joining...' : 'Join Trip'}
          </button>
        </div>
      </div>
    );
  }

  return null;
}

function ConfirmModal({ tripTitle, onConfirm, onCancel, error }) {
  return (
    <div style={modalOverlay}>
      <div style={modalContent}>
        <h3 style={{ marginBottom: 12, fontSize: 18 }}>Leave "{tripTitle}"?</h3>
        {error && <p style={errorStyle}>{error}</p>}
        <p style={{ color: 'var(--text3)', marginBottom: 20, fontSize: 14 }}>You'll need a new invite code to rejoin this trip.</p>
        <button onClick={onConfirm} className="btn-primary" style={{ width: '100%', marginBottom: 10 }}>Leave Trip</button>
        <button onClick={onCancel} className="btn-ghost" style={{ width: '100%' }}>Cancel</button>
      </div>
    </div>
  );
}

const shell = {
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  padding: '56px 28px 40px',
  background: 'var(--bg)',
  overflowY: 'auto',
};

const labelStyle = {
  display: 'block',
  fontSize: 11,
  color: 'var(--text3)',
  textTransform: 'uppercase',
  letterSpacing: '0.07em',
  marginBottom: 6,
};

const backBtn = {
  background: 'var(--bg3)',
  border: 'none',
  color: 'var(--text2)',
  width: 36, height: 36,
  borderRadius: '50%',
  cursor: 'pointer',
  fontSize: 18,
  marginBottom: 24,
  alignSelf: 'flex-start',
};

const errorStyle = {
  color: 'var(--accent)',
  fontSize: 13,
  marginBottom: 12,
  padding: '10px 14px',
  background: 'rgba(255,77,109,0.1)',
  borderRadius: 10,
};

const tripCard = {
  display: 'flex',
  alignItems: 'center',
  padding: 16,
  background: 'var(--bg2)',
  borderRadius: 12,
  border: '1px solid var(--border)',
  marginBottom: 12,
  cursor: 'pointer',
};

const modalOverlay = {
  position: 'fixed',
  top: 0, left: 0, right: 0, bottom: 0,
  background: 'rgba(0,0,0,0.7)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 100,
};

const modalContent = {
  background: 'var(--bg2)',
  padding: 24,
  borderRadius: 16,
  maxWidth: 320,
  margin: 16,
};