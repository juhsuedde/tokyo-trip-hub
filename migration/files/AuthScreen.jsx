// frontend/src/screens/AuthScreen.jsx
// Handles both /login and /register — toggled by the `mode` prop.
// Mobile-first, dark mode, matches existing design system.

import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext.jsx';

export default function AuthScreen({ mode: initialMode = 'login', onSuccess }) {
  const [mode, setMode] = useState(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, register } = useAuth();

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        if (!name.trim()) { setError('Name is required'); setLoading(false); return; }
        await register(email, password, name.trim());
      }
      onSuccess?.();
    } catch (err) {
      setError(err.message ?? 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  const isLogin = mode === 'login';

  return (
    <div className="auth-screen">
      <div className="auth-card">
        {/* Logo / header */}
        <div className="auth-header">
          <span className="auth-logo">🗼</span>
          <h1 className="auth-title">TokyoTrip Hub</h1>
          <p className="auth-subtitle">
            {isLogin ? 'Welcome back' : 'Start your journey'}
          </p>
        </div>

        {/* Tab switcher */}
        <div className="auth-tabs">
          <button
            className={`auth-tab ${isLogin ? 'active' : ''}`}
            onClick={() => { setMode('login'); setError(''); }}
            type="button"
          >
            Log in
          </button>
          <button
            className={`auth-tab ${!isLogin ? 'active' : ''}`}
            onClick={() => { setMode('register'); setError(''); }}
            type="button"
          >
            Sign up
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="auth-form">
          {!isLogin && (
            <div className="auth-field">
              <label htmlFor="auth-name">Your name</label>
              <input
                id="auth-name"
                type="text"
                placeholder="Juliana"
                value={name}
                onChange={e => setName(e.target.value)}
                autoComplete="name"
                maxLength={80}
                required
              />
            </div>
          )}

          <div className="auth-field">
            <label htmlFor="auth-email">Email</label>
            <input
              id="auth-email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoComplete={isLogin ? 'username' : 'email'}
              required
            />
          </div>

          <div className="auth-field">
            <label htmlFor="auth-password">Password</label>
            <input
              id="auth-password"
              type="password"
              placeholder={isLogin ? '••••••••' : 'At least 8 characters'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete={isLogin ? 'current-password' : 'new-password'}
              minLength={isLogin ? 1 : 8}
              required
            />
          </div>

          {error && <p className="auth-error">{error}</p>}

          <button type="submit" className="auth-submit" disabled={loading}>
            {loading ? (
              <span className="auth-spinner" />
            ) : isLogin ? (
              'Log in'
            ) : (
              'Create account'
            )}
          </button>
        </form>

        {!isLogin && (
          <p className="auth-disclaimer">
            Free tier includes up to 3 trips and Markdown export.
          </p>
        )}
      </div>

      <style>{`
        .auth-screen {
          min-height: 100dvh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #0a0a0a;
          padding: 24px 16px;
          padding-bottom: calc(24px + env(safe-area-inset-bottom));
        }

        .auth-card {
          width: 100%;
          max-width: 400px;
          background: #141414;
          border: 1px solid #222;
          border-radius: 20px;
          padding: 32px 24px;
        }

        .auth-header {
          text-align: center;
          margin-bottom: 28px;
        }

        .auth-logo {
          font-size: 2.5rem;
          display: block;
          margin-bottom: 8px;
        }

        .auth-title {
          font-size: 1.4rem;
          font-weight: 700;
          color: #fff;
          margin: 0 0 4px;
          letter-spacing: -0.02em;
        }

        .auth-subtitle {
          color: #666;
          font-size: 0.875rem;
          margin: 0;
        }

        .auth-tabs {
          display: flex;
          background: #1a1a1a;
          border-radius: 10px;
          padding: 4px;
          margin-bottom: 24px;
        }

        .auth-tab {
          flex: 1;
          padding: 8px;
          border: none;
          background: transparent;
          color: #666;
          border-radius: 7px;
          font-size: 0.9rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.15s;
        }

        .auth-tab.active {
          background: #252525;
          color: #fff;
        }

        .auth-form {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .auth-field {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .auth-field label {
          font-size: 0.8rem;
          font-weight: 500;
          color: #888;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .auth-field input {
          background: #1a1a1a;
          border: 1px solid #2a2a2a;
          border-radius: 10px;
          color: #fff;
          font-size: 1rem;
          padding: 12px 14px;
          outline: none;
          transition: border-color 0.15s;
          -webkit-appearance: none;
        }

        .auth-field input:focus {
          border-color: #ff4c4c;
        }

        .auth-field input::placeholder {
          color: #444;
        }

        .auth-error {
          background: rgba(255, 76, 76, 0.1);
          border: 1px solid rgba(255, 76, 76, 0.3);
          border-radius: 8px;
          color: #ff6b6b;
          font-size: 0.85rem;
          margin: 0;
          padding: 10px 12px;
        }

        .auth-submit {
          background: #ff4c4c;
          border: none;
          border-radius: 12px;
          color: #fff;
          cursor: pointer;
          font-size: 1rem;
          font-weight: 600;
          height: 48px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-top: 4px;
          transition: opacity 0.15s, transform 0.1s;
        }

        .auth-submit:active { transform: scale(0.98); }
        .auth-submit:disabled { opacity: 0.6; cursor: not-allowed; }

        .auth-spinner {
          width: 20px;
          height: 20px;
          border: 2px solid rgba(255,255,255,0.3);
          border-top-color: #fff;
          border-radius: 50%;
          animation: spin 0.6s linear infinite;
        }

        @keyframes spin { to { transform: rotate(360deg); } }

        .auth-disclaimer {
          color: #555;
          font-size: 0.78rem;
          text-align: center;
          margin: 16px 0 0;
          line-height: 1.5;
        }
      `}</style>
    </div>
  );
}
