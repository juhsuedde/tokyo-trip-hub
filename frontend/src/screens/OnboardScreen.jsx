import { useState } from 'react';
import { api } from '../lib/api.js';

export default function OnboardScreen({ onComplete }) {
  const [step, setStep] = useState('start'); // start | create | join | registering
  const [name, setName] = useState('');
  const [tripTitle, setTripTitle] = useState('Tokyo Spring 2026');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function registerAndRun(fn) {
    setError('');
    setLoading(true);
    try {
      if (!name.trim()) { setError('Enter your name first'); setLoading(false); return; }
      const { user, sessionToken } = await api.register(name.trim());
      localStorage.setItem('sessionToken', sessionToken);
      const result = await fn(user);
      onComplete(user, result.trip);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const handleCreate = () => registerAndRun(async () => {
    if (!tripTitle.trim()) throw new Error('Trip name is required');
    return api.createTrip({
      title: tripTitle.trim(),
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    });
  });

  const handleJoin = () => registerAndRun(async () => {
    if (!inviteCode.trim()) throw new Error('Enter the invite code');
    return api.joinTrip(inviteCode.trim().toUpperCase());
  });

  const inputStyle = { marginBottom: 12 };

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

      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>Your name</label>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Alex, Yuki, Sara..."
          autoComplete="given-name"
        />
      </div>

      <button className="btn-primary" onClick={() => setStep('create')} style={{ marginBottom: 10 }}>
        Create a Trip
      </button>
      <button className="btn-ghost" onClick={() => setStep('join')}>
        Join with Invite Code
      </button>

      <p style={{ textAlign: 'center', color: 'var(--text3)', fontSize: 12, marginTop: 20 }}>
        No account needed · Works offline
      </p>
    </div>
  );

  if (step === 'create') return (
    <div style={shell}>
      <button onClick={() => setStep('start')} style={backBtn}>←</button>
      <h2 className="syne" style={{ fontSize: 24, fontWeight: 700, marginBottom: 6 }}>
        Plan your <span style={{ color: 'var(--accent)' }}>adventure</span>
      </h2>
      <p style={{ color: 'var(--text3)', fontSize: 13, marginBottom: 24 }}>
        You'll get an invite code to share with your group.
      </p>

      <label style={labelStyle}>Your name</label>
      <input value={name} onChange={e => setName(e.target.value)} placeholder="Your name" style={inputStyle} />

      <label style={labelStyle}>Trip name</label>
      <input value={tripTitle} onChange={e => setTripTitle(e.target.value)} placeholder="Tokyo Spring 2026" style={inputStyle} />

      <label style={labelStyle}>Dates (optional)</label>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
        <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
        <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
      </div>

      {error && <p style={errorStyle}>{error}</p>}

      <div style={{ marginTop: 'auto', paddingTop: 24 }}>
        <button className="btn-primary" onClick={handleCreate} disabled={loading}>
          {loading ? 'Creating...' : 'Create Trip & Get Invite Code'}
        </button>
      </div>
    </div>
  );

  if (step === 'join') return (
    <div style={shell}>
      <button onClick={() => setStep('start')} style={backBtn}>←</button>
      <h2 className="syne" style={{ fontSize: 24, fontWeight: 700, marginBottom: 6 }}>
        Join a <span style={{ color: 'var(--accent)' }}>trip</span>
      </h2>
      <p style={{ color: 'var(--text3)', fontSize: 13, marginBottom: 24 }}>
        Enter the 6-character invite code from your group.
      </p>

      <label style={labelStyle}>Your name</label>
      <input value={name} onChange={e => setName(e.target.value)} placeholder="Your name" style={inputStyle} />

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
        <button className="btn-primary" onClick={handleJoin} disabled={loading}>
          {loading ? 'Joining...' : 'Join Trip'}
        </button>
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
