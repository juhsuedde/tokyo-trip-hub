# Phase 4 Integration Checklist

A step-by-step guide to applying all Phase 4 changes to the existing codebase.

---

## 1. New environment variables

Add these to `backend/.env` (and your production secrets manager):

```env
# Required — generate a strong random value, e.g.:
#   node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
JWT_SECRET=<strong-random-secret>
```

No other new env vars are required for Phase 4 Step 1.
Stripe keys (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`) will be needed in Phase 4 Step 3.

---

## 2. Install new backend dependencies

```bash
cd backend
npm install bcrypt cookie-parser jsonwebtoken zod multer
npm install --save-dev supertest vitest
```

---

## 3. Apply Prisma schema

Replace `prisma/schema.prisma` with the Phase 4 version (provided).

Then run:

```bash
# Generate and apply the migration
npx prisma migrate dev --name phase4_user_accounts

# Regenerate Prisma client
npx prisma generate
```

The migration will add:
- `User` table
- `TripMembership` table (join table with `role` enum)
- `Subscription` table
- Add optional `userId` FK to `Entry`, `Reaction`, `Comment`
- Add `archived` boolean to `Trip`

---

## 4. Run session migration script

After the schema migration, convert existing anonymous trips to placeholder accounts:

```bash
node prisma/migrate_sessions_to_users.js
```

This is **idempotent** — safe to re-run. It only touches trips with no existing memberships.

---

## 5. Add/replace backend files

| File | Action |
|------|--------|
| `backend/src/routes/auth.js` | **ADD** (new file) |
| `backend/src/routes/trips.js` | **REPLACE** (Phase 4 version) |
| `backend/src/middleware/auth.js` | **ADD** (new file) |
| `backend/src/middleware/subscription.js` | **ADD** (new file) |
| `backend/src/lib/upload.js` | **ADD** (new file) |
| `backend/src/index.js` | **REPLACE** (Phase 4 version) |
| `backend/vitest.config.js` | **ADD** (new file) |

---

## 6. Update existing route files

### `backend/src/routes/entries.js`
Add `requireAuth` + `requireTripRole('EDITOR')` to `POST /trips/:id/entries`:

```js
import { requireAuth, requireTripRole } from '../middleware/auth.js';

// Before: router.post('/trips/:tripId/entries', upload.single('media'), createEntry)
// After:
router.post('/trips/:tripId/entries',
  requireAuth,
  requireTripRole('EDITOR'),    // uses req.params.tripId
  upload.single('media'),
  createEntry
);

// Attach userId from req.user when creating entries:
// data: { ...body, tripId, userId: req.user?.id ?? null }
```

### `backend/src/routes/export.js`
The `enforceExportFormat` middleware is already applied at the router level in `index.js`.
No changes needed inside `export.js` itself.

---

## 7. Add/replace frontend files

| File | Action |
|------|--------|
| `frontend/src/contexts/AuthContext.jsx` | **ADD** (new file) |
| `frontend/src/lib/api.js` | **REPLACE** (Phase 4 version — adds JWT injection) |
| `frontend/src/components/RequireAuth.jsx` | **ADD** (new file) |
| `frontend/src/screens/AuthScreen.jsx` | **ADD** (new file) |
| `frontend/src/screens/TripDashboard.jsx` | **ADD** (new file) |
| `frontend/src/screens/UserProfileScreen.jsx` | **ADD** (new file) |
| `frontend/src/App.jsx` | **REPLACE** (Phase 4 version) |

---

## 8. Offline queue backward compatibility

The existing IndexedDB offline queue stores entries with a `deviceId` field.
When syncing queued entries after a user logs in, the backend's `optionalAuth`
middleware will now attach `req.user` — so newly synced entries get linked to
the user automatically.

**No changes needed to the offline queue logic.** Entries captured before
login will sync correctly once authenticated.

---

## 9. Run tests

```bash
cd backend
npm test
```

Expected: all tests in `src/middleware/__tests__/` and `src/routes/__tests__/` pass.

---

## 10. Verify manually

```bash
# Register
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"password123","name":"You"}'

# Login
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"password123"}'

# Get profile (replace TOKEN with value from login response)
curl http://localhost:3001/api/auth/me \
  -H "Authorization: Bearer TOKEN"

# Create a trip
curl -X POST http://localhost:3001/api/trips \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Tokyo 2026"}'
```

---

## What's next (Phase 4 Steps 2–5)

- **Step 2:** Stripe subscription integration + webhook handler
- **Step 3:** Cloudinary/S3 swap in `upload.js` (already pre-stubbed)
- **Step 4:** Custom domain support + public trip pages
- **Step 5:** Premium upgrade flow in frontend (`/upgrade` screen)
