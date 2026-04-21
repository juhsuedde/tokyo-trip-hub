import { useState } from 'react';
import FeedScreen from './FeedScreen';
import MapScreen from './MapScreen';
import ExportModal from '../components/ExportModal';

export default function TripScreen({ trip, socket, user }) {
  const [activeTab, setActiveTab] = useState('feed'); // 'feed' | 'map'
  const [showExport, setShowExport] = useState(false);

  const tabBarStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: '0 12px',
    borderBottom: '1px solid #1e1e1e',
    background: '#111',
    flexShrink: 0,
  };

  const tabStyle = {
    padding: '12px 16px',
    background: 'none',
    border: 'none',
    borderBottom: '2px solid transparent',
    color: '#666',
    fontSize: 14,
    cursor: 'pointer',
    fontWeight: 500,
    transition: 'all 0.15s',
  };

  const tabActiveStyle = {
    color: '#f5f0e8',
    borderBottom: '2px solid #dc2626',
  };

  const exportBtnStyle = {
    padding: '7px 14px',
    background: '#1a1a1a',
    border: '1px solid #333',
    borderRadius: 8,
    color: '#ccc',
    fontSize: 13,
    cursor: 'pointer',
    fontWeight: 500,
    transition: 'all 0.15s',
    marginLeft: 8,
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Tab bar */}
      <div style={tabBarStyle}>
        <button
          style={{ ...tabStyle, ...(activeTab === 'feed' ? tabActiveStyle : {}) }}
          onClick={() => setActiveTab('feed')}
        >
          📋 Feed
        </button>
        <button
          style={{ ...tabStyle, ...(activeTab === 'map' ? tabActiveStyle : {}) }}
          onClick={() => setActiveTab('map')}
        >
          🗺️ Map
        </button>
        <div style={{ flex: 1 }} />
        <button
          style={exportBtnStyle}
          onClick={() => setShowExport(true)}
        >
          📖 Export
        </button>
      </div>

      {/* Main content area */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {activeTab === 'feed' && <FeedScreen tripId={trip.id} socket={socket} user={user} />}
        {activeTab === 'map'  && <MapScreen  tripId={trip.id} user={user} />}
      </div>

      {/* ExportModal */}
      {showExport && (
        <ExportModal
          tripId={trip.id}
          socket={socket}
          onClose={() => setShowExport(false)}
        />
      )}
    </div>
  );
}