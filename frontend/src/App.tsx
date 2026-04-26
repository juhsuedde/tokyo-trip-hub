import { useState, useEffect } from 'react';
import { api } from './lib/api';
import { registerBackgroundSync, syncOfflineEntries } from './lib/offlineQueue';
import OnboardScreen from './screens/OnboardScreen';
import AuthScreen from './screens/AuthScreen';
import FeedScreen from './screens/FeedScreen';
import MapScreen from './screens/MapScreen';
import ExportModal from './components/ExportModal';

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [trip, setTrip] = useState<any>(null);
  const [activeTab, setActiveTab] = useState('feed');
  const [showExport, setShowExport] = useState(false);
  const [loading, setLoading] = useState(true);

  // Restore session on mount
  useEffect(() => {
    const token = localStorage.getItem('sessionToken');
    const savedTrip = localStorage.getItem('currentTrip');

    if (token) {
      api.me()
        .then(({ user }) => {
          if (savedTrip) {
            setUser(user);
            setTrip(JSON.parse(savedTrip));
          } else {
            setUser(user);
          }
          registerBackgroundSync();
          syncOfflineEntries();
        })
        .catch(() => {
          localStorage.removeItem('sessionToken');
          localStorage.removeItem('currentTrip');
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  // Also sync on online event as fallback
  useEffect(() => {
    const handleOnline = () => {
      syncOfflineEntries();
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, []);

  // Also register background sync on auth
  const handleAuth = (user: any, token: string) => {
    localStorage.setItem('sessionToken', token);
    setUser(user);
    registerBackgroundSync();
  };

  const handleOnboarded = (user: any, trip: any) => {
    localStorage.setItem('currentTrip', JSON.stringify(trip));
    setUser(user);
    setTrip(trip);
  };

  const handleLogout = () => {
    localStorage.removeItem('sessionToken');
    localStorage.removeItem('currentTrip');
    setUser(null);
    setTrip(null);
  };

  const handleSwitchTrip = () => {
    localStorage.removeItem('currentTrip');
    setTrip(null);
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', background: 'var(--bg)' }}>
        <div className="spinner" />
      </div>
    );
  }

  // Not logged in → Auth screen
  if (!user) {
    return <AuthScreen onLogin={handleAuth} />;
  }

  // Logged in but no trip → Onboard (pass logged-in user)
  if (!trip) {
    return <OnboardScreen user={user} onComplete={handleOnboarded} onLogout={handleLogout} />;
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      {/* Screen content */}
      <div style={{ flex: 1, minHeight: 0 }}>
        {activeTab === 'feed' && <FeedScreen user={user} trip={trip} onSwitchTrip={handleSwitchTrip} />}
        {activeTab === 'map' && <MapScreen tripId={trip!.id} />}
        {showExport && <ExportModal tripId={trip!.id} socket={null as any} onClose={() => setShowExport(false)} />}
      </div>

      {/* Tab bar */}
      <div className="tab-bar">
        <button onClick={() => setActiveTab('feed')} className={activeTab === 'feed' ? 'active' : ''}>Feed</button>
        <button onClick={() => setActiveTab('map')} className={activeTab === 'map' ? 'active' : ''}>Map</button>
        <button onClick={() => setShowExport(true)}>📖 Export</button>
      </div>
    </div>
  );
}