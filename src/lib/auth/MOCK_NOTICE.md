# FIFAYITI Auth — Mock Notice (PILOT ONLY)

> ⚠️ **The auth system in this repository is a pilot/demo placeholder.** It is
> NOT suitable for production. Real authentication MUST be implemented
> before deploying to any environment with real users or real data.

## What's currently in place

### 1. Client-side role state (`src/store/auth-session-store.ts`)

A small Zustand store holds `adminAuthed: boolean` and `adminRole: AdminRole`
(president | director | live_operator | team_admin). The values are
persisted to `localStorage` so reloads don't kick the operator out.

This is **for UX convenience only** — clearing localStorage does NOT log
anyone out of a backend (because there isn't one). The role string is
explicitly client-trustworthy-nothing.

### 2. Client-side permission matrix (`src/lib/auth/permissions.ts`)

A static map of `Role → Permission[]`. The `usePermission(permission)` hook
reads the role from the auth-session store and returns whether the role
has the permission. Used to hide/show UI elements (e.g. don't render the
"Apwouve" button unless `usePermission("schedule.approve")`).

Again, this is **UX gating only**. A user can trivially set their role
to `president` in localStorage and the UI will let them see everything.

### 3. Audit log (`src/lib/audit/audit-log.ts`)

In-memory Zustand store. Records of privileged actions
(`player.verify`, `schedule.approve`, `match.event.correct`, etc.) live
in memory for the duration of the page session and are lost on reload.
The UI (player-verification, schedule, match-control audit trail)
reads from this store for display.

This is **demonstration only** — it provides no real evidence trail. A
malicious user can clear it. A real backend MUST write audit records to
the `AuditLog` Prisma table (see `prisma/schema.prisma`) on the server
side, append-only, with no delete API.

## What's missing (production MUST implement)

### Server-side authentication

Wire **NextAuth.js v4** (already in `package.json`) for:

- Email + password login against the `User` table (`passwordHash` field,
  bcrypt/argon2 hashing).
- HTTPS-only session cookie. No localStorage token.
- Server-side session check on EVERY privileged API route
  (`/api/players/:id/verify`, `/api/schedule/:id/approve`, etc.).
- The client-side `adminRole` is derived from the server session — never
  trusted directly from the request body.

### Server-side authorization

For every privileged action:

1. Resolve the actor's role from the session (server-side only).
2. Call a server-side `hasPermission(role, action)` — NOT the client-side
   one in `src/lib/auth/permissions.ts`. The server copy can live in
   `src/lib/auth/server-permissions.ts` (to be created) or inline in the
   API route handler.
3. If unauthorized, return `403 Forbidden` and record an audit entry
   with `action: "unauthorized.attempt"`.

### Multi-factor authentication (MFA)

MFA is mentioned in the brief but NOT implemented in pilot. Production
MUST enforce MFA for the `president` and `director` roles (e.g. TOTP via
`otplib` or WebAuthn). The login flow becomes:

1. Email + password → server validates, returns a "MFA challenge required"
   response (NOT a session cookie yet).
2. User submits TOTP code → server validates against a stored secret
   (encrypted at rest).
3. Only on successful MFA, the session cookie is issued.

### Server-side audit log persistence

Replace the in-memory `recordAudit()` calls with `POST /api/audit`. The
server:

1. Authenticates the user (NextAuth session).
2. Verifies the user has the permission for the action they're auditing
   (defense in depth — the API route handler must independently check
   the permission for the underlying operation, not trust the audit
   request).
3. Writes an immutable row to the `AuditLog` table.
4. Returns the record to the client for optimistic UI update.

The `AuditLog` table is **append-only**: no `UPDATE`, no `DELETE`. The
Prisma schema does not expose mutations beyond `create`.

## Migration checklist

When wiring production auth, replace or update these files:

- [ ] `src/store/auth-session-store.ts` → replace with NextAuth's
  `useSession()` from `next-auth/react`. Keep the JSDoc warning in
  place — the new client-side state still must NOT be trusted for
  authorization.
- [ ] `src/lib/auth/permissions.ts` → split into:
  - `src/lib/auth/permissions.ts` — pure function + types (server-safe).
  - `src/lib/auth/use-permission.ts` — the React hook (client-only).
- [ ] `src/lib/audit/audit-log.ts` → replace the in-memory Zustand store
  with `fetch("/api/audit", { method: "POST", body: ... })`. Keep the
  `useAuditLog()` hook for display, but make it fetch from
  `/api/audit?targetType=...&target=...`.
- [ ] `prisma/schema.prisma` → run `bun run db:push` to materialize the
  `User`, `AuditLog`, and other tables.
- [ ] Add API route handlers under `src/app/api/` for each privileged
  operation (player.verify, schedule.approve, match.event.correct, etc.).
  Each handler MUST:
  1. Check the NextAuth session.
  2. Resolve the actor's role from the session (not the request body).
  3. Verify `hasPermission(role, action)`.
  4. Perform the operation inside a transaction.
  5. Write an audit record (append-only).
  6. Return the result.

## TL;DR

- Client-side role state is a UX nicety. It is NOT security.
- The `hasPermission()` helper is for hiding buttons. It is NOT
  authorization.
- The in-memory audit log is for demo. It is NOT evidence.
- Every privileged operation MUST be re-checked server-side in
  production.
