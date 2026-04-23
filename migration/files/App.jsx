// frontend/src/App.jsx  (Phase 4 — replace existing)
// Adds AuthProvider wrapping the entire app, RequireAuth gate before
// the main app, and a TripDashboard as the new entry screen.
// All existing screen logic (Feed, Map, etc.) is preserved — we just
// add an outer auth layer and trip selection.

import { useState } from 'react';
import { AuthProvider } from './contexts/AuthContext.jsx';
import RequireAuth from './components/RequireAuth.jsx';
import TripDashboard from './screens/TripDashboard.jsx';

// Existing screens — preserved from Phase 3
// (Import them as-is; just rendered conditionally by trip selection)
import FeedScreen from './screens/FeedScreen.jsx';
import MapScreen from './screens/MapScreen.jsx';

export default function App() {
  return (
    <AuthProvider>
      <RequireAuth>
        <AuthenticatedApp />
      </RequireAuth>
    </AuthProvider>
  );
}

function AuthenticatedApp() {
  const [activeTrip, setActiveTrip] = useState(null);
  const [activeTab, setActiveTab] = useState('feed');

  // No trip selected → show dashboard
  if (!activeTrip) {
    return <TripDashboard onSelectTrip={setActiveTrip} />;
  }

  // Trip selected → existing tab-based UI
  return (
    <div className="app">
      {/* Trip header with back button */}
      <div className="trip-header">
        <button className="back-btn" onClick={() => setActiveTrip(null)}>←</button>
        <span className="trip-name">{activeTrip.name}</span>
        <div style={{ width: 40 }} />
      </div>

      {/* Existing tab content */}
      <div className="tab-content">
        {activeTab === 'feed' && <FeedScreen tripId={activeTrip.id} />}
        {activeTab === 'map' && <MapScreen tripId={activeTrip.id} />}
      </div>

      {/* Bottom tab bar — matches existing Phase 3 design */}
      <nav className="tab-bar">
        <button
          className={`tab-item ${activeTab === 'feed' ? 'active' : ''}`}
          onClick={() => setActiveTab('feed')}
        >
          <span>📋</span>
          <span>Feed</span>
        </button>
        <button
          className={`tab-item ${activeTab === 'map' ? 'active' : ''}`}
          onClick={() => setActiveTab('map')}
        >
          <span>🗺️</span>
          <span>Map</span>
        </button>
      </nav>

      <style>{`
        .app {
          display: flex;
          flex-direction: column;
          height: 100dvh;
          background: #0a0a0a;
          color: #fff;
        }
        .trip-header {
          align-items: center;
          background: #0a0a0a;
          border-bottom: 1px solid #1a1a1a;
          display: flex;
          height: 52px;
          justify-content: space-between;
          padding: 0 12px;
          padding-top: env(safe-area-inset-top);
          flex-shrink: 0;
        }
        .back-btn {
          background: none; border: none; color: #ff4c4c; cursor: pointer;
          font-size: 1.2rem; padding: 8px; width: 40px;
        }
        .trip-name {
          font-size: 0.95rem; font-weight: 600;
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
          flex: 1; text-align: center; padding: 0 8px;
        }
        .tab-content { flex: 1; overflow: hidden; }
        .tab-bar {
          border-top: 1px solid #1a1a1a;
          display: flex;
          padding-bottom: env(safe-area-inset-bottom);
        }
        .tab-item {
          align-items: center;
          background: none;
          border: none;
          color: #555;
          cursor: pointer;
          display: flex;
          flex: 1;
          flex-direction: column;
          font-size: 0.65rem;
          gap: 2px;
          padding: 10px 0;
          transition: color 0.15s;
        }
        .tab-item span:first-child { font-size: 1.25rem; }
        .tab-item.active { color: #ff4c4c; }
      `}</style>
    </div>
  );
}
