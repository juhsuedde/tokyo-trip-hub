/**
 * PATCH for frontend/src/screens/TripScreen.jsx
 *
 * This file shows the DIFF / changes needed to add:
 *  1. A "Map" tab next to the "Feed" tab
 *  2. An "📖 Export" button in the trip header
 *  3. ExportModal integration
 *
 * Apply these changes to your existing TripScreen.jsx.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ── ADD these imports at the top of TripScreen.jsx ──────────────────────────

import MapScreen from './MapScreen';
import ExportModal from '../components/ExportModal';

// ── ADD to state declarations ────────────────────────────────────────────────

// const [activeTab, setActiveTab] = useState('feed');  // 'feed' | 'map'
// const [showExport, setShowExport] = useState(false);

// ── REPLACE your existing tab bar (usually looks like just "Feed" tab) ───────
// Replace the existing single-tab header with this:

/*
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
*/

// ── REPLACE your existing main content area ──────────────────────────────────
// Where you currently render <FeedScreen tripId={...} />, change to:

/*
{activeTab === 'feed' && <FeedScreen tripId={trip.id} socket={socket} />}
{activeTab === 'map'  && <MapScreen  tripId={trip.id} />}
*/

// ── ADD the ExportModal at the bottom of the JSX (before closing </div>) ────

/*
{showExport && (
  <ExportModal
    tripId={trip.id}
    socket={socket}
    onClose={() => setShowExport(false)}
  />
)}
*/

// ── SUGGESTED styles to add ──────────────────────────────────────────────────

export const tabBarStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  padding: '0 12px',
  borderBottom: '1px solid #1e1e1e',
  background: '#111',
  flexShrink: 0,
};

export const tabStyle = {
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

export const tabActiveStyle = {
  color: '#f5f0e8',
  borderBottom: '2px solid #dc2626',
};

export const exportBtnStyle = {
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
