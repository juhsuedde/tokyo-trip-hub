// frontend/src/components/RequireAuth.jsx
// Wrap any route/component that needs authentication.
// Shows a loading spinner during initial hydration,
// then redirects to /login if unauthenticated.

import { useAuth } from '../contexts/AuthContext.jsx';
import AuthScreen from '../screens/AuthScreen.jsx';

export default function RequireAuth({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{
        minHeight: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0a0a0a',
      }}>
        <div style={{
          width: 32,
          height: 32,
          border: '2px solid #222',
          borderTopColor: '#ff4c4c',
          borderRadius: '50%',
          animation: 'spin 0.6s linear infinite',
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!user) {
    // Render auth inline — no router dependency needed
    return <AuthScreen mode="login" />;
  }

  return children;
}
