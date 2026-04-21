import { useState, useEffect } from 'react';
import { api } from './lib/api.js';
import OnboardScreen from './screens/OnboardScreen.jsx';
import FeedScreen from './screens/FeedScreen.jsx';
import MapScreen from './screens/MapScreen.jsx';

export default function App() {
  const [user, setUser] = useState(null);
  const [trip, setTrip] = useState(null);
  const [tab, setTab] = useState('feed');
  const [loading, setLoading] = useState(true);

  // Restore session on mount
  useEffect(() => {
    const token = localStorage.getItem('sessionToken');
    const savedTrip = localStorage.getItem('currentTrip');

    if (token && savedTrip) {
      api.me()
        .then(({ user }) => {
          setUser(user);
          setTrip(JSON.parse(savedTrip));
        })
        .catch(() => {
          // Session expired — clear and re-onboard
          localStorage.removeItem('sessionToken');
          localStorage.removeItem('currentTrip');
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const handleOnboarded = (user, trip) => {
    localStorage.setItem('currentTrip', JSON.stringify(trip));
    setUser(user);
    setTrip(trip);
  };

  const handleLeaveTrip = () => {
    localStorage.removeItem('currentTrip');
    setTrip(null);
    setTab('feed');
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', background: 'var(--bg)' }}>
        <div className="spinner" />
      </div>
    );
  }

  if (!user || !trip) {
    return <OnboardScreen onComplete={handleOnboarded} />;
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)', position: 'relative' }}>
      {/* Screen content */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        {tab === 'feed' && <FeedScreen user={user} trip={trip} />}
        {tab === 'map'  && <MapScreen  user={user} trip={trip} />}
      </div>

      {/* Bottom nav */}
      <nav style={{
        display: 'flex',
        background: 'var(--bg2)',
        borderTop: '1px solid var(--border)',
        paddingBottom: 'calc(8px + var(--safe-bottom))',
        flexShrink: 0,
      }}>
        {[
          { id: 'feed', icon: '📱', label: 'Feed' },
          { id: 'map',  icon: '🗺',  label: 'Map' },
        ].map(({ id, icon, label }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            style={{
              flex: 1, background: 'none', border: 'none', cursor: 'pointer',
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              gap: 3, padding: '10px 0 4px',
              color: tab === id ? 'var(--accent)' : 'var(--text3)',
              fontSize: 10, fontFamily: 'DM Sans, sans-serif',
              transition: 'color 0.15s',
            }}
          >
            <span style={{ fontSize: 22 }}>{icon}</span>
            {label}
          </button>
        ))}
      </nav>
    </div>
  );
}
