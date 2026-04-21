import { useState, useEffect } from 'react';
import { api } from '../lib/api.js';

export default function MapScreen({ user, trip }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    async function loadAll() {
      try {
        // Load all entries (no cursor — we want everything for the map)
        let all = [];
        let cursor = null;
        let hasMore = true;
        while (hasMore) {
          const { entries: items, pagination } = await api.getFeed(trip.id, cursor);
          all = [...all, ...items];
          hasMore = pagination.hasMore;
          cursor = pagination.nextCursor;
        }
        setEntries(all.filter(e => e.latitude && e.longitude));
      } catch (err) {
        console.error('[map] load error:', err);
      } finally {
        setLoading(false);
      }
    }
    loadAll();
  }, [trip.id]);

  const geoEntries = entries.filter(e => e.latitude && e.longitude);
  const catColors = {
    FOOD_DRINK: '#ff4d6d',
    SIGHTSEEING: '#ffd166',
    SHOPPING: '#06d6a0',
    TIP_WARNING: '#a78bfa',
    default: '#9998b8',
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '52px 20px 12px', flexShrink: 0 }}>
        <h1 className="syne" style={{ fontSize: 22, fontWeight: 800 }}>Trip Map</h1>
        <p style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
          {geoEntries.length} pinned location{geoEntries.length !== 1 ? 's' : ''} · {trip.destination}
        </p>
      </div>

      {/* Map placeholder — replace with Leaflet/Mapbox in Phase 2 */}
      <div style={{
        flex: 1, background: '#101018', position: 'relative', overflow: 'hidden',
        borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)',
      }}>
        {/* Grid lines */}
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'linear-gradient(var(--bg3) 1px, transparent 1px), linear-gradient(90deg, var(--bg3) 1px, transparent 1px)',
          backgroundSize: '40px 40px', opacity: 0.4,
        }} />

        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <div className="spinner" />
          </div>
        ) : geoEntries.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text3)' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📍</div>
            <p style={{ fontSize: 13 }}>No geotagged entries yet</p>
            <p style={{ fontSize: 12, marginTop: 4 }}>Enable location when capturing entries</p>
          </div>
        ) : (
          <>
            {/* Render pins at pseudo-positions (real map in Phase 2) */}
            {geoEntries.map((entry, i) => {
              const color = catColors[entry.category] || catColors.default;
              // Distribute pins visually until real map is integrated
              const x = 15 + ((i * 67) % 70);
              const y = 10 + ((i * 43) % 70);
              return (
                <div
                  key={entry.id}
                  onClick={() => setSelected(entry.id === selected?.id ? null : entry)}
                  style={{
                    position: 'absolute',
                    left: `${x}%`, top: `${y}%`,
                    transform: 'translate(-50%, -100%)',
                    cursor: 'pointer',
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    zIndex: selected?.id === entry.id ? 10 : 1,
                  }}
                >
                  <div style={{
                    background: color, color: '#fff',
                    borderRadius: 100, padding: '4px 10px',
                    fontSize: 11, fontWeight: 500, whiteSpace: 'nowrap',
                    maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis',
                    boxShadow: `0 4px 12px ${color}55`,
                    border: selected?.id === entry.id ? '2px solid #fff' : 'none',
                  }}>
                    {entry.address?.split(',')[0] || entry.type}
                  </div>
                  <div style={{ width: 2, height: 8, background: color }} />
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
                </div>
              );
            })}

            {/* Selected entry card */}
            {selected && (
              <div style={{
                position: 'absolute', bottom: 16, left: 16, right: 16,
                background: 'var(--bg2)', border: '1px solid var(--border)',
                borderRadius: 16, padding: '14px 16px',
                animation: 'fadeSlideUp 0.2s ease',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 11, color: catColors[selected.category] || 'var(--text3)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {selected.category?.replace('_', ' ') || selected.type}
                  </span>
                  <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 16 }}>✕</button>
                </div>
                <p style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.5, marginBottom: 6 }}>
                  {selected.rawText}
                </p>
                <p style={{ fontSize: 12, color: 'var(--text3)' }}>
                  📍 {selected.address} · by {selected.user?.name}
                </p>
              </div>
            )}
          </>
        )}

        {/* Legend */}
        {!loading && geoEntries.length > 0 && !selected && (
          <div style={{
            position: 'absolute', bottom: 16, left: 16, right: 16,
            background: 'rgba(10,10,15,0.9)', border: '1px solid var(--border)',
            borderRadius: 14, padding: '10px 14px',
          }}>
            <p style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 6 }}>Category</p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {Object.entries(catColors).filter(([k]) => k !== 'default').map(([cat, color]) => (
                <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
                  <span style={{ fontSize: 11, color: 'var(--text2)' }}>{cat.replace('_', ' ')}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Note about real map */}
      <div style={{ padding: '10px 16px', background: 'var(--bg2)', flexShrink: 0 }}>
        <p style={{ fontSize: 11, color: 'var(--text3)', textAlign: 'center' }}>
          Phase 2: Replace with Leaflet + OpenStreetMap tiles for real geolocation pins
        </p>
      </div>
    </div>
  );
}
