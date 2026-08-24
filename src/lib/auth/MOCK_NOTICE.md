# FIFAYITI Auth — Status (post Task 9 v2)

This file replaces the old pilot-only MOCK_NOTICE.md. The auth system
has been promoted to production-grade (single-tenant, fixed-staff).

## What's in place

### 1. Server-side authentication

- `src/lib/auth/credentials.ts` — scrypt(N=16384, r=8, p=1, dklen=32)
  password hashes for every staff account. Plaintext NEVER touches the
  repo — only the salt + derived key.
- `src/lib/auth/session.ts` — HMAC-SHA256-signed session cookie
  (`fifayiti-session`, HttpOnly + Secure + SameSite=Lax, 8-hour TTL).
  Tamper-evident — the role cannot be spoofed by editing the cookie.
- `src/app/api/auth/login/route.ts`  — POST { email, password } → 200 + cookie
- `src/app/api/auth/logout/route.ts` — POST clears cookie
- `src/app/api/auth/me/route.ts`     — GET returns { authed, role }

### 2. Server-side authorization

- `src/middleware.ts` — protects `/operator/*` by role + slot binding:
  - `/operator/camera/[N]` accessible to cameramanN (exact slot match),
    plus president / director / live_operator (any slot for oversight).
  - `/operator/control` reserved for live_operator / president / director.
  - Cameraman trying `/operator/control` → redirect to own slot.
  - Cameraman1 trying `/operator/camera/2` → redirect to `/operator/camera/1`.
- `src/lib/auth/permissions.ts` — pure data + functions, used both by
  client (via `use-permission.ts` hook) and by server code.

### 3. Account inventory (8 accounts)

Per the user's pattern `[role]@fifayiti.com / [role]fifAYITI.com`:

- `president@fifayiti.com`      / `presidentfifAYITI.com`      — superuser
- `director@fifayiti.com`       / `directorfifAYITI.com`       — operations + admin (no admins.manage / schedule.approve)
- `live_operator@fifayiti.com`  / `live_operatorfifAYITI.com`  — broadcast desk
- `cameraman1@fifayiti.com`      / `cameraman1fifAYITI.com`     — camera slot 1
- `cameraman2@fifayiti.com`      / `cameraman2fifAYITI.com`     — camera slot 2
- `cameraman3@fifayiti.com`      / `cameraman3fifAYITI.com`     — camera slot 3
- `team_admin@fifayiti.com`     / `team_adminfifAYITI.com`     — read-only teams/players/schedule
- `cameraman@fifayiti.com`      / `cameramanfifAYITI.com`      — legacy, bound to slot 1

Each cameraman has its OWN account — they no longer share a single
credential. The slot each cameraman can reach is enforced by middleware
(server-side), not just by client-side routing.

### 4. Role-specialized interfaces

`src/components/fifayiti/admin/role-shell.tsx` exports `RoleShell` and
`CameramanRedirect`. Each role now gets a SIDEBAR_PRESET that lists
only the nav items they actually use:

- **President**       — full 13-item superuser sidebar
- **Director**        — all items except `admins.manage` page
- **Live operator**   — Match / TV / Replay + Schedule / Competition / Settings
- **Team admin**      — Teams / Players / Schedule / Settings (read-only)
- **Cameraman (1/2/3)** — hard redirect to `/operator/camera/N`; no SPA access

The dashboard also renders a `RoleGreetingBanner` at the top — each
role gets a role-specific welcome card describing what they can do.

## What's still TODO

- Replace the audit log (currently client-side Zustand) with a real
  server-side append-only `AuditLog` Prisma table.
- Add MFA (TOTP) for the `president` and `director` roles.
- Replace the in-file `CREDENTIALS` array with a Prisma `User` table
  (so password rotation does not require a redeploy).

## Migration checklist

If you want to migrate to a database-backed `User` table:

- [ ] Add `User` model to `prisma/schema.prisma` (id, email, role,
  passwordHash, salt, createdAt, lastLoginAt).
- [ ] `bun run db:push` to materialize.
- [ ] Update `verifyCredentials()` to query Prisma instead of the
  in-file `CREDENTIALS` array.
- [ ] Seed the 8 accounts above by computing each salt + hash at insert
  time (use `scripts/gen-credentials.py` as a reference for the
  scrypt parameters).
- [ ] Add an admin UI for rotating passwords (president only).
