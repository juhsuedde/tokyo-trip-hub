/**
 * frontend/src/screens/MapScreen.jsx
 * Interactive Leaflet map showing all geolocated trip entries
 */
import { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-markercluster';
import 'leaflet/dist/leaflet.css';
import { api } from '../lib/api';

const CATEGORY_CONFIG = {
  FOOD_DRINK:      { color: '#f97316', emoji: '🍜', label: 'Food & Drink' },
  SIGHTSEEING:     { color: '#3b82f6', emoji: '🗼', label: 'Sightseeing' },
  ACCOMMODATION:   { color: '#a855f7', emoji: '🏨', label: 'Accommodation' },
  TRANSPORTATION:  { color: '#22c55e', emoji: '🚄', label: 'Transportation' },
  SHOPPING:        { color: '#eab308', emoji: '🛍️', label: 'Shopping' },
  TIP_WARNING:     { color: '#ef4444', emoji: '⚠️', label: 'Tips & Warnings' },
  MISC:            { color: '#94a3b8', emoji: '📝', label: 'Misc' },
  null:            { color: '#94a3b8', emoji: '📍', label: 'Entry' },
};

function getCatConfig(cat) {
  return CATEGORY_CONFIG[cat] || CATEGORY_CONFIG['null'];
}

// Fit map to bounds of all markers
function FitBounds({ entries }) {
  const map = useMap();
  useEffect(() => {
    const pts = entries.filter(e => e.latitude && e.longitude);
    if (pts.length === 0) return;
    if (pts.length === 1) {
      map.setView([pts[0].latitude, pts[0].longitude], 14);
      return;
    }
    const lats = pts.map(e => e.latitude);
    const lngs = pts.map(e => e.longitude);
    map.fitBounds([
      [Math.min(...lats) - 0.005, Math.min(...lngs) - 0.005],
      [Math.max(...lats) + 0.005, Math.max(...lngs) + 0.005],
    ], { padding: [32, 32] });
  }, [entries]);
  return null;
}

export default function MapScreen({ tripId }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState(null);
  const [selectedEntry, setSelectedEntry] = useState(null);

  useEffect(() => {
    async function load() {
      try {
        // Load all feed pages
        let all = [];
        let cursor = null;
        do {
          const res = await api.getFeed(tripId, cursor);
          all = all.concat(res.entries || []);
          cursor = res.nextCursor || null;
        } while (cursor);
        setEntries(all.filter(e => e.latitude && e.longitude));
      } catch (err) {
        console.error('MapScreen load error:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [tripId]);

  const geoEntries = activeFilter
    ? entries.filter(e => e.category === activeFilter)
    : entries;

  // Count by category for legend
  const catCounts = {};
  for (const e of entries) {
    const k = e.category || 'MISC';
    catCounts[k] = (catCounts[k] || 0) + 1;
  }

  const defaultCenter = geoEntries.length > 0
    ? [geoEntries[0].latitude, geoEntries[0].longitude]
    : [35.6762, 139.6503]; // Tokyo default

  if (loading) {
    return (
      <div style={styles.loadingWrap}>
        <div style={styles.spinner} />
        <p style={styles.loadingText}>Loading map…</p>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div style={styles.emptyWrap}>
        <div style={styles.emptyIcon}>🗺️</div>
        <h3 style={styles.emptyTitle}>No locations yet</h3>
        <p style={styles.emptyText}>Entries with GPS data will appear here.</p>
      </div>
    );
  }

  return (
    <div style={styles.wrapper}>
      {/* Legend / Filter bar */}
      <div style={styles.legend}>
        <button
          style={{ ...styles.filterBtn, ...(activeFilter === null ? styles.filterBtnActive : {}) }}
          onClick={() => setActiveFilter(null)}
        >
          All ({entries.length})
        </button>
        {Object.entries(catCounts).map(([cat, count]) => {
          const cfg = getCatConfig(cat);
          return (
            <button
              key={cat}
              style={{
                ...styles.filterBtn,
                ...(activeFilter === cat ? styles.filterBtnActive : {}),
                borderColor: cfg.color,
              }}
              onClick={() => setActiveFilter(activeFilter === cat ? null : cat)}
            >
              <span style={{ color: cfg.color }}>{cfg.emoji}</span>
              {' '}{cfg.label} ({count})
            </button>
          );
        })}
      </div>

      {/* Map */}
      <MapContainer
        center={defaultCenter}
        zoom={13}
        style={styles.map}
        zoomControl={true}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        />
        <FitBounds entries={geoEntries} />
        {geoEntries.map(entry => {
          const cfg = getCatConfig(entry.category);
          const isSelected = selectedEntry?.id === entry.id;
          return (
            <CircleMarker
              key={entry.id}
              center={[entry.latitude, entry.longitude]}
              radius={isSelected ? 14 : 10}
              pathOptions={{
                color: '#fff',
                weight: 2,
                fillColor: cfg.color,
                fillOpacity: 0.9,
              }}
              eventHandlers={{
                click: () => setSelectedEntry(entry),
              }}
            >
              <Popup maxWidth={240}>
                <div style={styles.popup}>
                  {entry.contentUrl && (
                    <img
                      src={entry.contentUrl}
                      alt="entry"
                      style={styles.popupImg}
                      onError={e => e.target.style.display = 'none'}
                    />
                  )}
                  <div style={styles.popupBody}>
                    <div style={styles.popupMeta}>
                      <span style={{ ...styles.popupCat, background: cfg.color }}>
                        {cfg.emoji} {cfg.label}
                      </span>
                      {entry.sentiment && (
                        <span style={styles.popupSentiment}>
                          {entry.sentiment === 'POSITIVE' ? '😊' : entry.sentiment === 'NEGATIVE' ? '😟' : '😐'}
                        </span>
                      )}
                    </div>
                    {entry.rawText && (
                      <p style={styles.popupText}>{entry.rawText.slice(0, 120)}{entry.rawText.length > 120 ? '…' : ''}</p>
                    )}
                    {entry.transcription && !entry.rawText && (
                      <p style={styles.popupText}>{entry.transcription.slice(0, 120)}…</p>
                    )}
                    <p style={styles.popupAuthor}>
                      {entry.user?.name} · {new Date(entry.capturedAt).toLocaleDateString()}
                    </p>
                    {entry.address && (
                      <p style={styles.popupAddr}>📍 {entry.address}</p>
                    )}
                    {entry.tags?.length > 0 && (
                      <div style={styles.popupTags}>
                        {entry.tags.slice(0, 4).map(t => (
                          <span key={t} style={styles.popupTag}>{t}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>

      <div style={styles.countBadge}>
        {geoEntries.length} location{geoEntries.length !== 1 ? 's' : ''}
        {activeFilter ? ` · filtered` : ''}
      </div>
    </div>
  );
}

const styles = {
  wrapper: {
    position: 'relative',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    background: '#0f0f0f',
  },
  legend: {
    display: 'flex',
    gap: 6,
    padding: '10px 12px',
    overflowX: 'auto',
    background: '#111',
    borderBottom: '1px solid #222',
    flexShrink: 0,
    scrollbarWidth: 'none',
  },
  filterBtn: {
    flexShrink: 0,
    padding: '5px 10px',
    background: '#1a1a1a',
    border: '1px solid #333',
    borderRadius: 20,
    color: '#ccc',
    fontSize: 12,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    transition: 'all 0.15s',
  },
  filterBtnActive: {
    background: '#2a2a2a',
    color: '#fff',
    borderColor: '#555',
  },
  map: {
    flex: 1,
    width: '100%',
    minHeight: 0,
  },
  countBadge: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    background: 'rgba(0,0,0,0.75)',
    color: '#fff',
    fontSize: 12,
    padding: '4px 10px',
    borderRadius: 12,
    backdropFilter: 'blur(8px)',
    zIndex: 1000,
    pointerEvents: 'none',
  },
  loadingWrap: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    color: '#888',
    background: '#0f0f0f',
  },
  spinner: {
    width: 32,
    height: 32,
    border: '3px solid #333',
    borderTop: '3px solid #dc2626',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  loadingText: { color: '#666', fontSize: 14 },
  emptyWrap: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    background: '#0f0f0f',
    color: '#888',
  },
  emptyIcon: { fontSize: 48 },
  emptyTitle: { color: '#ccc', fontWeight: 600, fontSize: 18, margin: 0 },
  emptyText: { color: '#666', fontSize: 14, margin: 0 },
  popup: { minWidth: 180 },
  popupImg: {
    width: '100%',
    height: 110,
    objectFit: 'cover',
    borderRadius: 6,
    marginBottom: 8,
    display: 'block',
  },
  popupBody: { padding: '0 2px' },
  popupMeta: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 },
  popupCat: {
    fontSize: 11,
    padding: '2px 8px',
    borderRadius: 10,
    color: '#fff',
    fontWeight: 600,
  },
  popupSentiment: { fontSize: 14 },
  popupText: { fontSize: 13, color: '#1c1917', lineHeight: 1.5, margin: '0 0 4px' },
  popupAuthor: { fontSize: 11, color: '#888', margin: '4px 0 2px' },
  popupAddr: { fontSize: 11, color: '#888', margin: '2px 0' },
  popupTags: { display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  popupTag: {
    fontSize: 10,
    padding: '1px 6px',
    background: '#f3e8d0',
    borderRadius: 8,
    color: '#78350f',
  },
};
