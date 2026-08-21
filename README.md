# FIFAYITI — Federation Inter Football Ayiti

> ⚽ Federation management platform for Haitian small-sided football (Tikan) leagues.
> Built with Next.js 16, React 19, Prisma 6 (SQLite), Tailwind 4, shadcn/ui, Zustand.

[![Status: Online](https://img.shields.io/badge/status-online-success)](http://167.86.124.101:8080)
[![Next.js](https://img.shields.io/badge/Next.js-16-black)](https://nextjs.org)
[![React](https://img.shields.io/badge/React-19-blue)](https://react.dev)
[![Prisma](https://img.shields.io/badge/Prisma-6-2D3748)](https://www.prisma.io)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)](https://www.typescriptlang.org)

---

## 🌍 About

FIFAYITI is a complete federation management platform for Haitian small-sided
football. The president of the federation can:

- **Set up championships** with a flexible format inspired by FIFA World Cup +
  UEFA Champions League patterns (configurable group count, teams per group,
  qualifiers per group, single/double round-robin, knockout bracket, optional
  3rd-place match)
- **Manage teams & players** with photos, logos, and detailed rosters
- **Schedule matches** — auto-generate round-robin group stage matches using the
  standard circle-method algorithm
- **Operate live matches** with a real chronometer (counts up from 0:00,
  auto-stops at 30:00 per half, manual second-half start)
- **Display everything publicly** — groups, standings, knockout bracket,
  schedule, team profiles, player stats

The public site shows the active competition's name dynamically (entered by
the President when creating the championship).

---

## 🏗️ Architecture

### Tech Stack

| Layer | Technology |
|---|---|
| Frontend framework | Next.js 16 (App Router, Turbopack) |
| UI library | React 19 |
| Styling | Tailwind CSS 4 + shadcn/ui (New York style) |
| State management | Zustand (persisted to localStorage) |
| Database | SQLite (via Prisma 6) |
| ORM | Prisma Client 6 |
| Icons | Lucide React |
| Fonts | Manrope (body) + Archivo (display) |
| Language | Modern Haitian Creole (Kreyòl 2026) |

### Project Structure

```
fifayiti/
├── prisma/
│   └── schema.prisma              # DB schema: Competition, Group, Team, Player, Match, etc.
├── public/
│   ├── logo.svg
│   └── robots.txt
├── src/
│   ├── app/
│   │   ├── api/                   # REST API routes
│   │   │   ├── competitions/      # CRUD + active + assign-teams + generate-schedule + bracket + standings
│   │   │   ├── matches/           # CRUD + events + phase transitions (chronometer)
│   │   │   ├── players/           # PATCH + DELETE
│   │   │   ├── teams/             # CRUD + nested players
│   │   │   └── upload/            # Multipart photo/logo upload
│   │   ├── globals.css            # Tailwind + custom FIFAYITI design tokens
│   │   ├── layout.tsx             # Root layout with metadata
│   │   └── page.tsx               # Top-level router (public vs admin)
│   ├── components/
│   │   └── fifayiti/
│   │       ├── admin/             # Admin workspace (sidebar shell, dashboard, teams, match-control, etc.)
│   │       │   └── match-control/ # Live match operator UI (chronometer, scoreboard, event controls)
│   │       ├── public/            # Public site pages (home, teams, players, standings, tournament, etc.)
│   │       ├── match/             # Match detail page
│   │       ├── tv/                # FIFAYITI TV broadcast page
│   │       ├── brand-mark.tsx     # ⚽ Soccer ball emoji + wordmark
│   │       ├── team-crest.tsx     # Generated crest (fallback when no logo uploaded)
│   │       └── live-badge.tsx
│   ├── lib/
│   │   ├── domain/                # Domain types + (empty) seed data
│   │   ├── audit/
│   │   ├── auth/
│   │   ├── db.ts                  # Prisma client singleton
│   │   ├── utils.ts
│   │   └── fifayiti-data.ts       # Re-export barrel
│   ├── store/                     # Zustand stores (navigation, auth-session, match-session)
│   └── hooks/
├── Caddyfile                      # Documentation-only Caddy config (nginx is what's actually used in production)
├── next.config.ts
├── package.json
├── tailwind.config.ts
└── tsconfig.json
```

### Database Models

The Prisma schema implements a complete tournament management system inspired
by **FIFA World Cup** + **UEFA Champions League** patterns:

| Model | Purpose |
|---|---|
| `User` | Admin accounts ( PRESIDENT / DIRECTOR / LIVE_OPERATOR / TEAM_ADMIN roles) |
| `Competition` | A championship — name (entered by President), season, format config |
| `Group` | A group within a competition (A, B, C, ...) |
| `TeamRegistration` | Links a team to a competition + group |
| `Team` | A team (with optional logo URL, photo URL, colors) |
| `Player` | A player (with optional photo URL, position, jersey #, CIN) |
| `Match` | A match — group stage OR knockout (with `bracketSlot`, `stage`, `clock`, `half`) |
| `MatchEvent` | Goals, cards, substitutions, phase transitions |
| `Replay` | Saved match clips (permanent, append-only) |

### Tournament Format Support

| Format | Configuration |
|---|---|
| Group stage → Knockout (World Cup pattern) | `format: GROUPS_THEN_KNOCKOUT` |
| Group stage only (league style) | `format: GROUPS_ONLY` |
| Pure knockout bracket | `format: KNOCKOUT_ONLY` |
| Single round-robin (each pair plays once) | `rrType: SINGLE` |
| Double round-robin (home & away, UCL pattern) | `rrType: DOUBLE` |

Knockout bracket size = next power of 2 ≥ (groupCount × qualifiersPerGroup).
Optional 3rd-place match between semifinal losers.

### Standings Tiebreaker Cascade (FIFA-modern order)

1. Points (W=3, D=1, L=0)
2. Goal difference
3. Goals scored
4. (Stable sort preserves group order)

---

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ (or [Bun](https://bun.sh) — recommended, what's used in production)
- SQLite (built-in — no separate DB server needed)

### Installation

```bash
# Clone the repo
git clone https://github.com/YOUR_USERNAME/fifayiti.git
cd fifayiti

# Install dependencies (Bun recommended)
bun install
# OR
npm install

# Create .env file
echo 'DATABASE_URL="file:./db/fifayiti.db"' > .env
echo 'NEXT_PUBLIC_APP_NAME="FIFAYITI"' >> .env

# Generate Prisma client + create DB tables
bun run db:generate
bun run db:push --accept-data-loss

# Start the dev server
bun run dev
# → http://localhost:3000
```

### Production Build

```bash
bun run build
bun run start
```

### npm Scripts

| Script | Action |
|---|---|
| `dev` | Start dev server on port 3000 |
| `build` | Production build + copy static/public into standalone/ |
| `start` | Run the production standalone server |
| `lint` | ESLint |
| `db:push` | Sync Prisma schema to SQLite (with `--accept-data-loss`) |
| `db:generate` | Generate Prisma Client |
| `db:migrate` | Create a Prisma migration |
| `db:reset` | Reset the DB (destructive) |

---

## 🌐 Live Deployment

The project is deployed at: **http://167.86.124.101:8080**

- Code directory on server: `/var/www/fifayiti`
- PM2 process: `fifayiti` (port 4050)
- Nginx vhost: `/etc/nginx/sites-available/fifayiti` (port 8080 → 4050)
- SQLite DB: `/var/www/fifayiti/db/fifayiti.db`

---

## 📚 Tournament Format Research

This project's tournament structure is informed by research into:

- **FIFA World Cup 2022** (32 teams, 8 groups of 4, top 2 advance → R16 → QF → SF → Final + 3rd place)
- **FIFA World Cup 2026** (48 teams, 12 groups of 4, top 2 + 8 best thirds)
- **UEFA Champions League** (old format: 32 teams, 8 groups of 4, double round-robin → R16 → QF → SF → Final — no 3rd place)

The round-robin scheduling algorithm uses the standard **circle method**:
for `n` teams, generates `n-1` rounds of `n/2` matches each. For odd team
counts, a phantom "BYE" team is added.

---

## 🇭🇹 Language

The UI is written in **modern Haitian Creole (Kreyòl Ayisyen, 2026 idiom)** —
the primary language of the federation's audience. Code comments and this
README are in English.

---

## 📄 License

Proprietary — FIFAYITI Federation. All rights reserved.

---

## 👥 Roles

| Role | Powers |
|---|---|
| PRESIDENT | Create competitions, manage teams, schedule matches, manage admins |
| DIRECTOR | Manage teams, schedule matches |
| LIVE_OPERATOR | Operate live matches (chronometer, events) |
| TEAM_ADMIN | (Reserved — currently the federation operates everything centrally) |

> **Note:** Authentication is currently in pilot mode (client-side mock).
> Production deployment requires wiring NextAuth.js for real server-side
> authentication.
