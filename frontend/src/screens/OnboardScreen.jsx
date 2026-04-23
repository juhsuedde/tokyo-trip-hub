import { useState, useEffect } from 'react';
import { api } from '../lib/api.js';

export default function OnboardScreen({ user, onComplete, onLogout }) {
  const [step, setStep] = useState('start'); // start | create | join | trips
  const [trips, setTrips] = useState([]);
  const [tripTitle, setTripTitle] = useState('Tokyo Spring 2026');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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
      await loadTrips(); // Reload trips after create/join
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

  const [showConfirmLeave, setShowConfirmLeave] = useState(null);

  async function handleLeaveTrip(tripId) {
    if (!confirm('Leave this trip?')) return;
    try {
      await api.leaveTrip(tripId);
      await loadTrips();
    } catch (err) {
      setError(err.message);
    }
  }

  async function confirmLeaveTrip(tripId) {
    setShowConfirmLeave(tripId);
  }

  async function executeLeaveTrip() {
    try {
      await api.leaveTrip(showConfirmLeave);
      setShowConfirmLeave(null);
      await loadTrips();
    } catch (err) {
      setError(err.message);
    }
  }

  const handleCreate = () => handleTripAction(async () => {
    if (!tripTitle.trim()) throw new Error('Trip name is required');
    return api.createTrip({
      title: tripTitle.trim(),
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    });
  });

  const handleJoin = () => handleTripAction(async () => {
    if (!inviteCode.trim()) throw new Error('Enter the invite code');
    return api.joinTrip(inviteCode.trim().toUpperCase());
  });

  const inputStyle = { marginBottom: 12 };

  // Show user's trips
  if (step === 'trips' || (step === 'start' && trips.length > 0)) {
    return (
      <div style={shell}>
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
                onClick={(e) => { e.stopPropagation(); alert('click x for trip: ' + trip.id); confirmLeaveTrip(trip.id); }}
                style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', padding: 8, fontSize: 18 }}
              >
                ×
              </button>
            </div>
          ))}
        </div>

        <button className="btn-ghost" onClick={onLogout} style={{ marginTop: 16 }}>
          Logout
        </button>

        <button className="btn-primary" onClick={() => setStep('create')} style={{ marginBottom: 10 }}>
          Create New Trip
        </button>
<button className="btn-ghost" onClick={() => setStep('join')}>
          Join with Code
        </button>
      </div>
    );
  }

if (step === 'start') return (
    <div style={shell}>
      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>🗾</div>
        <h1 className="syne" style={{ fontSize: 28, fontWeight: 800, letterSpacing: -1 }}>
          TokyoTrip<span style={{ color: 'var(--accent)' }}>Hub</span>
        </h1>
        <p style={{ color: 'var(--text3)', marginTop: 6, fontSize: 13 }}>
          Group travel · Capture · Remember
        </p>
      </div>

      {user && (
        <p style={{ textAlign: 'center', color: 'var(--text2)', fontSize: 14, marginBottom: 24 }}>
          Welcome, <strong>{user.name}</strong>!
        </p>
      )}

      <button className="btn-primary" onClick={() => trips.length > 0 ? setStep('trips') : setStep('create')} style={{ marginBottom: 10 }}>
        {trips.length > 0 ? 'My Trips' : 'Create a Trip'}
      </button>
      <button className="btn-ghost" onClick={() => setStep('join')}>
        Join with Invite Code
      </button>
      <button className="btn-ghost" onClick={onLogout} style={{ marginTop: 16 }}>
        Logout
      </button>
    </div>
  );

  // Confirm modal - show for any step
  if (showConfirmLeave) {
    return (
      <ConfirmModal
        tripTitle={trips.find(t => t.id === showConfirmLeave)?.title}
        onConfirm={() => executeLeaveTrip()}
        onCancel={() => setShowConfirmLeave(null)}
      />
    );
  }
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

function ConfirmModal({ tripTitle, onConfirm, onCancel }) {
  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div style={{ background: 'var(--bg2)', padding: 24, borderRadius: 16, maxWidth: 320, margin: 16 }}>
        <h3 style={{ marginBottom: 12, fontSize: 18 }}>Leave "{tripTitle}"?</h3>
        <p style={{ color: 'var(--text3)', marginBottom: 20, fontSize: 14 }}>You'll need a new invite code to rejoin this trip.</p>
        <button onClick={onConfirm} className="btn-primary" style={{ width: '100%', marginBottom: 10 }}>
          Leave Trip
        </button>
        <button onClick={onCancel} className="btn-ghost" style={{ width: '100%' }}>
          Cancel
        </button>
      </div>
    </div>
  );
}
