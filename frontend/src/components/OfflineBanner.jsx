import { useEffect, useState } from 'react';
import { getPendingCount } from '../lib/offlineQueue';

export default function OfflineBanner() {
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    async function updateCount() {
      const count = await getPendingCount();
      setPendingCount(count);
    }

    updateCount();
    const interval = setInterval(updateCount, 10000); // Update every 10s

    // Also update when network comes online
    const handleOnline = updateCount;
    window.addEventListener('online', handleOnline);

    return () => {
      clearInterval(interval);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  if (pendingCount === 0) return null;

  return (
    <div className="offline-banner">
      <div className="offline-banner-content">
        <div className="offline-banner-icon">📡</div>
        <div className="offline-banner-message">
          You have {pendingCount} pending edit{pendingCount === 1 ? '' : 's'} that will sync when back online.
        </div>
      </div>
    </div>
  );
}