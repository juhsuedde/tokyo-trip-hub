import { useState, useEffect } from 'react';
import { api } from './lib/api.js';
import OnboardScreen from './screens/OnboardScreen.jsx';
import FeedScreen from './screens/FeedScreen.jsx';
import MapScreen from './screens/MapScreen.jsx';
import ExportModal from '../components/ExportModal';

export default function App() {
  const [user, setUser] = useState(null);
  const [trip, setTrip] = useState(null);
  const [activeTab, setActiveTab] = useState('feed');
  const [showExport, setShowExport] = useState(false);
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
     setActiveTab('feed');
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
         {activeTab === 'feed' && <FeedScreen user={user} trip={trip} />}
         {activeTab === 'map'  && <MapScreen  user={user} trip={trip} />}
         {showExport && <ExportModal tripId={trip.id} onClose={() => setShowExport(false)} />}
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
