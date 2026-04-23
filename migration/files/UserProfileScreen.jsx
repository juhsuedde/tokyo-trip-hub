// frontend/src/screens/UserProfileScreen.jsx
// Accessible from the trip dashboard header.
// Lets the user update name, upload avatar, and see their subscription tier.

import { useState, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext.jsx';

export default function UserProfileScreen({ onBack }) {
  const { user, updateProfile, logout } = useAuth();
  const [name, setName] = useState(user?.name ?? '');
  const [preview, setPreview] = useState(user?.avatarUrl ?? null);
  const [avatarFile, setAvatarFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef();

  const isPremium = user?.subscription?.tier === 'PREMIUM';

  function handleAvatarChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarFile(file);
    setPreview(URL.createObjectURL(file));
  }

  async function handleSave() {
    if (!name.trim()) { setError('Name cannot be empty'); return; }
    setSaving(true);
    setError('');
    setSuccess(false);

    try {
      if (avatarFile) {
        const fd = new FormData();
        fd.append('avatar', avatarFile);
        fd.append('data', JSON.stringify({ name: name.trim() }));
        // api.uploadPut calls PUT /auth/profile with multipart
        const { api } = await import('../lib/api.js');
        await api.uploadPut('/auth/profile', fd);
        // Re-fetch user via updateProfile to sync context
        await updateProfile({});
      } else {
        await updateProfile({ name: name.trim() });
      }
      setSuccess(true);
      setAvatarFile(null);
    } catch (err) {
      setError(err.message ?? 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="profile-screen">
      {/* Header */}
      <div className="profile-header">
        <button className="back-btn" onClick={onBack}>←</button>
        <h2>Profile</h2>
        <div style={{ width: 40 }} />
      </div>

      {/* Avatar */}
      <div className="profile-avatar-wrap">
        <div className="profile-avatar" onClick={() => fileRef.current?.click()}>
          {preview
            ? <img src={preview} alt="avatar" />
            : <span>{user?.name?.[0]?.toUpperCase()}</span>}
          <div className="avatar-overlay">📷</div>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          style={{ display: 'none' }}
          onChange={handleAvatarChange}
        />
        <p className="avatar-hint">Tap to change</p>
      </div>

      {/* Fields */}
      <div className="profile-fields">
        <div className="profile-field">
          <label>Display name</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            maxLength={80}
            placeholder="Your name"
          />
        </div>

        <div className="profile-field">
          <label>Email</label>
          <input value={user?.email ?? ''} disabled className="disabled" />
        </div>
      </div>

      {/* Subscription */}
      <div className="profile-subscription">
        <div className="sub-badge">
          {isPremium ? '⭐ Premium' : '🆓 Free Plan'}
        </div>
        {!isPremium && (
          <p className="sub-upgrade">
            Upgrade for unlimited trips, PDF/EPUB exports, and priority AI processing.
          </p>
        )}
        {isPremium && user?.subscription?.currentPeriodEnd && (
          <p className="sub-renews">
            Renews {new Date(user.subscription.currentPeriodEnd).toLocaleDateString()}
          </p>
        )}
      </div>

      {error && <p className="profile-error">{error}</p>}
      {success && <p className="profile-success">Profile updated ✓</p>}

      <button className="profile-save" onClick={handleSave} disabled={saving}>
        {saving ? 'Saving…' : 'Save changes'}
      </button>

      <button className="profile-logout" onClick={logout}>Sign out</button>

      <style>{`
        .profile-screen {
          min-height: 100dvh;
          background: #0a0a0a;
          color: #fff;
          padding-bottom: calc(32px + env(safe-area-inset-bottom));
        }
        .profile-header {
          align-items: center;
          border-bottom: 1px solid #1a1a1a;
          display: flex;
          height: 52px;
          justify-content: space-between;
          padding: 0 12px;
          padding-top: env(safe-area-inset-top);
        }
        .profile-header h2 { font-size: 1rem; font-weight: 600; margin: 0; }
        .back-btn {
          background: none; border: none; color: #ff4c4c;
          cursor: pointer; font-size: 1.2rem; padding: 8px; width: 40px;
        }
        .profile-avatar-wrap {
          align-items: center; display: flex; flex-direction: column;
          gap: 8px; padding: 28px 0 20px;
        }
        .profile-avatar {
          border-radius: 50%; cursor: pointer; height: 88px;
          overflow: hidden; position: relative; width: 88px;
          background: #1a1a1a; border: 2px solid #2a2a2a;
          display: flex; align-items: center; justify-content: center;
          font-size: 2rem; font-weight: 700; color: #ff4c4c;
        }
        .profile-avatar img { height: 100%; object-fit: cover; width: 100%; }
        .avatar-overlay {
          background: rgba(0,0,0,0.5); bottom: 0; display: flex;
          align-items: center; justify-content: center;
          font-size: 1rem; height: 30px;
          left: 0; position: absolute; right: 0;
        }
        .avatar-hint { color: #555; font-size: 0.75rem; margin: 0; }
        .profile-fields { display: flex; flex-direction: column; gap: 16px; padding: 0 16px; }
        .profile-field { display: flex; flex-direction: column; gap: 6px; }
        .profile-field label {
          color: #888; font-size: 0.75rem; font-weight: 500;
          letter-spacing: 0.05em; text-transform: uppercase;
        }
        .profile-field input {
          background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 10px;
          color: #fff; font-size: 1rem; height: 44px; outline: none; padding: 0 14px;
          transition: border-color 0.15s;
        }
        .profile-field input:focus { border-color: #ff4c4c; }
        .profile-field input.disabled { color: #555; cursor: not-allowed; }
        .profile-subscription {
          background: #141414; border: 1px solid #222; border-radius: 12px;
          margin: 20px 16px 0; padding: 16px;
        }
        .sub-badge {
          display: inline-block; background: #1a1a1a; border: 1px solid #2a2a2a;
          border-radius: 20px; color: #fff; font-size: 0.85rem;
          font-weight: 600; padding: 4px 12px;
        }
        .sub-upgrade { color: #666; font-size: 0.8rem; line-height: 1.5; margin: 10px 0 0; }
        .sub-renews { color: #555; font-size: 0.75rem; margin: 8px 0 0; }
        .profile-error {
          background: rgba(255,76,76,0.1); border: 1px solid rgba(255,76,76,0.3);
          border-radius: 8px; color: #ff6b6b; font-size: 0.85rem;
          margin: 12px 16px 0; padding: 10px 12px;
        }
        .profile-success {
          background: rgba(76,255,76,0.1); border: 1px solid rgba(76,255,76,0.2);
          border-radius: 8px; color: #4ade80; font-size: 0.85rem;
          margin: 12px 16px 0; padding: 10px 12px;
        }
        .profile-save {
          background: #ff4c4c; border: none; border-radius: 12px; color: #fff;
          cursor: pointer; font-size: 1rem; font-weight: 600; height: 48px;
          margin: 20px 16px 0; width: calc(100% - 32px); display: block;
          transition: opacity 0.15s;
        }
        .profile-save:disabled { opacity: 0.5; cursor: not-allowed; }
        .profile-logout {
          background: none; border: 1px solid #2a2a2a; border-radius: 12px; color: #666;
          cursor: pointer; font-size: 0.9rem; height: 44px; margin: 12px 16px 0;
          width: calc(100% - 32px); display: block;
        }
      `}</style>
    </div>
  );
}
