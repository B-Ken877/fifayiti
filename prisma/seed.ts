// FIFAYITI seed — populates prisma/dev.db with a realistic demo tournament.
//
// Run: bun prisma/seed.ts   (or: bun run db:seed)
//
// Idempotent: wipes competition/team/player/match/replay data, then rebuilds.
// The seeded dev.db is committed to the repo so Vercel deployments ship
// with baseline data (runtime admin edits on Vercel remain ephemeral).

import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const now = Date.now();
const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const ago = (days: number, hour = 16) =>
  new Date(now - days * DAY).setUTCHours(hour + 4, 0, 0, 0); // hour in Haiti local (UTC-4 → +4)

// ─────────────────────────── Teams ───────────────────────────

interface TeamSeed {
  id: string; name: string; short: string; c1: string; c2: string;
  venue: string; addr: string; group: "A" | "B"; founded: string; conn: "BON" | "MOYEN" | "FEBL";
}

const TEAMS: TeamSeed[] = [
  { id: "team-pot", name: "Potoprens FC",        short: "POT", c1: "#1D4ED8", c2: "#FFFFFF", venue: "Stad Silvio Cator",     addr: "Av. Dessalines, Potoprens", group: "A", founded: "2019", conn: "BON"   },
  { id: "team-okp", name: "Real Okap",           short: "OKP", c1: "#DC2626", c2: "#1E293B", venue: "Park Rejyonal Okap",    addr: "Kat 11, Kap Ayisyen",     group: "A", founded: "2020", conn: "MOYEN" },
  { id: "team-jkm", name: "Jakmèl United",       short: "JKM", c1: "#EA580C", c2: "#111827", venue: "Stad Jakmèl",           addr: "Jakmèl, Sidès",           group: "A", founded: "2021", conn: "MOYEN" },
  { id: "team-sgn", name: "Santral Gonnayiv",    short: "SGN", c1: "#16A34A", c2: "#F8FAFC", venue: "Parc Leclerc",          addr: "Gonayiv, Artibonit",      group: "A", founded: "2019", conn: "FEBL"  },
  { id: "team-lyg", name: "Leyogàn SC",          short: "LYG", c1: "#7C3AED", c2: "#FACC15", venue: "Stad Leyogàn",          addr: "Leyogàn",                 group: "B", founded: "2020", conn: "MOYEN" },
  { id: "team-kfd", name: "Kafou Dynasti",       short: "KFD", c1: "#0D9488", c2: "#134E4A", venue: "Terenn Kafou",          addr: "Kafou, Potoprens",        group: "B", founded: "2018", conn: "BON"   },
  { id: "team-rjm", name: "Reyal Jeremi",        short: "RJM", c1: "#9F1239", c2: "#38BDF8", venue: "Stad Jeremi",           addr: "Jeremi, Grandans",        group: "B", founded: "2022", conn: "FEBL"  },
  { id: "team-sdk", name: "Sid Kay FC",          short: "SDK", c1: "#EAB308", c2: "#111827", venue: "Stad René Delcour",     addr: "Okay",                    group: "B", founded: "2019", conn: "MOYEN" },
];

// ─────────────────────────── Players ───────────────────────────

const FIRST = ["Jean", "Pierre", "Wesley", "Dieudonné", "Kervens", "Steeve", "Frantzdy", "Ricardo",
  "Josué", "Emmanuel", "Dolphin", "Bertrand", "Carly", "Jeff", "Nadège", "Woodly",
  "Marc-Angelo", "Frantzo", "Josué", "Ronal", "Dylan", "Fabrice", "Garry", "Kelly",
  "Samuel", "Tafia", "Widmaïer", "Yves", "Zacharie", "Anderson", "Belony", "Chéry",
  "Danilo", "Elsie", "Fedo", "Guerline", "Hervé", "Ismaël", "Jonas", "Kélyus",
  "Ludwig", "Mackenson", "Nesly", "Odney", "Patrick", "Quentin", "Rodrigo", "Sabine",
  "Toussaint", "Ulrick", "Vanel", "Wisky", "Xiomara", "Yannick", "Zépérin", "Abelard",
  "Béranger", "Cadic", "Dukens", "Ernsi", "Fritzner", "Génèse", "Hérold", "Ivenca",
  "Jodel", "Kévin", "Lourdy", "Mackindy", "Néhémie", "Ozer", "Péguy", "Richeman"];

const LAST = ["Pierre", "Jean-Baptiste", "Joseph", "Désir", "Charlemagne", "Étienne", "Belizaire",
  "Saintil", "Delfort", "Auguste", "Moïse", "Lafleur", "Cadeau", "Beauvoir", "Duperval",
  "Gilles", "Faustin", "Meristil", "Noël", "Belfort", "Dorvil", "Pierre-Louis", "Antoine",
  "Vilmé", "Bastia", "Chérenfant", "Olympio", "Delva", "Beltré", "Fortuné", "Lamartinière",
  "Samedi", "Toussaint", "Valcin", "Zéphirin", "Alcé", "Baptiste", "Cadet", "Dorsainvil",
  "Estimé", "Fleurimond", "Guillaume", "Hyppolite", "Jerôme", "Lubin", "Metellus",
  "Nau", "Ogé", "Pétion", "Rémy", "Saint-Fleur", "Thélusma", "Ulysse", "Vixamar",
  "Williams", "Yve", "Zérogé", "Avélus", "Brice", "Cicus", "Damesseur", "Elvéus",
  "Ferdinand", "Gaspard", "Hilaire", "Innocent", "Joubert", "Kitsa", "Lundy", "Mondésir"];

// [position, jersey] per squad slot — Tikan small-sided: 1 GK, 3 DEF, 3 MID, 2 FWD
const SQUAD: Array<[string, number]> = [
  ["GK", 1], ["DEF", 2], ["DEF", 3], ["DEF", 4],
  ["MID", 6], ["MID", 8], ["MID", 10],
  ["FWD", 7], ["FWD", 9],
];

const BIRTH_YEARS = ["1998-03-14", "1999-07-02", "2001-01-25", "1997-11-08", "2000-05-19",
  "2002-09-30", "1996-04-12", "2003-02-07", "1999-12-01"];

let nameIdx = 0;
function nextName() {
  const full = `${FIRST[nameIdx % FIRST.length]} ${LAST[(nameIdx * 7 + 3) % LAST.length]}`;
  nameIdx++;
  const [firstName, ...rest] = full.split(" ");
  return { firstName, lastName: rest.join(" ") };
}

async function seedPlayers(teamId: string) {
  const ids: Record<string, string> = {}; // jersey → playerId
  for (let s = 0; s < SQUAD.length; s++) {
    const [pos, jersey] = SQUAD[s];
    const { firstName, lastName } = nextName();
    const p = await db.player.create({
      data: {
        id: `${teamId}-p${jersey}`,
        teamId,
        firstName, lastName,
        jerseyNumber: jersey,
        position: pos as any,
        dateOfBirth: BIRTH_YEARS[s % BIRTH_YEARS.length],
        status: "VERIFYE",
        submittedAt: "2026-07-15",
        verifiedAt: new Date(now - 20 * DAY),
      },
    });
    ids[String(jersey)] = p.id;
  }
  return ids; // { "1": id, "7": id, "9": id, "10": id }
}

// ─────────────────────────── Matches ───────────────────────────

interface GoalSeed { team: string; jersey: number; minute: number; }

async function seedFinishedMatch(opts: {
  id: string; matchday: number; groupId: string; groupLabel: string;
  home: string; away: string; hs: number; as: number;
  kickoff: Date; venue: string; goals: GoalSeed[]; cards?: GoalSeed[];
  referee: string; competitionId: string; compName: string;
  playerIds: Record<string, Record<string, string>>; // teamId → jersey → playerId
}) {
  const { id, matchday, groupId, groupLabel, home, away, hs, as, kickoff, venue,
    goals, cards = [], referee, competitionId, compName, playerIds } = opts;

  await db.match.create({
    data: {
      id, competitionId, matchday,
      stage: "GROUP", groupId, groupLabel,
      homeTeamId: home, awayTeamId: away,
      homeScore: hs, awayScore: as,
      kickoff, venue, competitionName: compName,
      status: "FINI",
      referee, commissioner: "Komisè FIFAYITI",
      clock: 60 * 60, half: "POST", synced: true,
    },
  });

  const ev = [
    { minute: 0, half: 1, kind: "KOMANSE" as const, teamId: null, playerInId: null, description: "Kòmansman match la" },
    ...goals.map((g) => ({
      minute: g.minute, half: g.minute <= 30 ? 1 : 2,
      kind: "GOL" as const, teamId: g.team,
      playerInId: playerIds[g.team][String(g.jersey)],
      description: `Gòl! N°${g.jersey} (${TEAMS.find((t) => t.id === g.team)!.short})`,
    })),
    ...cards.map((c) => ({
      minute: c.minute, half: c.minute <= 30 ? 1 : 2,
      kind: "KAT_JON" as const, teamId: c.team,
      playerInId: playerIds[c.team][String(c.jersey)],
      description: `Kat jòn pou N°${c.jersey} (${TEAMS.find((t) => t.id === c.team)!.short})`,
    })),
    { minute: 30, half: 1, kind: "MWATYE_TAN" as const, teamId: null, playerInId: null, description: "Mwatye tan" },
    { minute: 60, half: 2, kind: "FEN_MATCH" as const, teamId: null, playerInId: null, description: "Fen match" },
  ];

  for (const e of ev) {
    await db.matchEvent.create({
      data: {
        matchId: id, minute: e.minute, half: e.half, kind: e.kind,
        teamId: e.teamId, playerInId: e.playerInId, description: e.description,
      },
    });
  }
}

async function seedReplay(matchId: string, kind: "GOL" | "SAV" | "KADON" | "SUBSTITUSYON" | "KAT",
  minute: number, title: string, teamId?: string, playerId?: string) {
  await db.replay.create({
    data: {
      matchId, title, kind, minute, teamId, playerId,
      thumbnail: "/logo.svg", permanent: true,
      savedAt: new Date(now - Math.round(Math.random() * 3 * DAY)),
    },
  });
}

// ─────────────────────────── Main ───────────────────────────

async function main() {
  console.log("Seeding FIFAYITI demo data…");

  // wipe (FK-safe order)
  await db.replay.deleteMany();
  await db.matchEvent.deleteMany();
  await db.match.deleteMany();
  await db.teamRegistration.deleteMany();
  await db.group.deleteMany();
  await db.competition.deleteMany();
  await db.player.deleteMany();
  await db.team.deleteMany();

  const COMP_NAME = "FIFAYITI Koup Nasyonal Tikan 2026";
  const comp = await db.competition.create({
    data: {
      id: "comp-tikan-2026",
      name: COMP_NAME,
      slug: "koup-nasyonal-tikan-2026",
      season: "2026",
      status: "IN_PROGRESS",
      format: "GROUPS_THEN_KNOCKOUT",
      rrType: "SINGLE",
      groupCount: 2, teamsPerGroup: 4, qualifiersPerGroup: 2,
      hasKnockoutPhase: true, hasThirdPlaceMatch: true,
      startDate: new Date(ago(12)), endDate: new Date(now + 32 * DAY),
    },
  });

  const groups: Record<string, string> = {};
  for (const label of ["A", "B"]) {
    const g = await db.group.create({
      data: { id: `group-${label.toLowerCase()}`, competitionId: comp.id, name: label },
    });
    groups[label] = g.id;
  }

  for (const t of TEAMS) {
    await db.team.create({
      data: {
        id: t.id, name: t.name, shortName: t.short,
        primaryColor: t.c1, secondaryColor: t.c2,
        founded: t.founded, homeVenue: t.venue, venueAddress: t.addr,
        venueConnectivity: t.conn, status: "AKTIF",
        registeredAt: "2026-07-01", group: t.group,
      },
    });
    await db.teamRegistration.create({
      data: {
        competitionId: comp.id, teamId: t.id, groupId: groups[t.group],
        seedNumber: TEAMS.filter((x) => x.group === t.group).indexOf(t) + 1,
      },
    });
  }

  const playerIds: Record<string, Record<string, string>> = {};
  for (const t of TEAMS) playerIds[t.id] = await seedPlayers(t.id);

  // Matchday 1 (finished)
  await seedFinishedMatch({ id: "m-a1", matchday: 1, groupId: groups.A, groupLabel: "A",
    home: "team-pot", away: "team-jkm", hs: 3, as: 1, kickoff: new Date(ago(11, 16)), venue: "Stad Silvio Cator",
    goals: [{ team: "team-pot", jersey: 9, minute: 8 }, { team: "team-jkm", jersey: 10, minute: 22 }, { team: "team-pot", jersey: 7, minute: 37 }, { team: "team-pot", jersey: 10, minute: 51 }],
    referee: "Arbitwason Kadayi", competitionId: comp.id, compName: COMP_NAME, playerIds });
  await seedFinishedMatch({ id: "m-a2", matchday: 1, groupId: groups.A, groupLabel: "A",
    home: "team-okp", away: "team-sgn", hs: 2, as: 0, kickoff: new Date(ago(11, 18)), venue: "Park Rejyonal Okap",
    goals: [{ team: "team-okp", jersey: 9, minute: 14 }, { team: "team-okp", jersey: 8, minute: 44 }],
    cards: [{ team: "team-sgn", jersey: 4, minute: 27 }],
    referee: "Arbitwason Pierrilus", competitionId: comp.id, compName: COMP_NAME, playerIds });
  await seedFinishedMatch({ id: "m-b1", matchday: 1, groupId: groups.B, groupLabel: "B",
    home: "team-kfd", away: "team-sdk", hs: 1, as: 1, kickoff: new Date(ago(10, 16)), venue: "Terenn Kafou",
    goals: [{ team: "team-kfd", jersey: 9, minute: 19 }, { team: "team-sdk", jersey: 10, minute: 47 }],
    referee: "Arbitwason Delva", competitionId: comp.id, compName: COMP_NAME, playerIds });
  await seedFinishedMatch({ id: "m-b2", matchday: 1, groupId: groups.B, groupLabel: "B",
    home: "team-lyg", away: "team-rjm", hs: 2, as: 1, kickoff: new Date(ago(10, 18)), venue: "Stad Leyogàn",
    goals: [{ team: "team-rjm", jersey: 9, minute: 11 }, { team: "team-lyg", jersey: 7, minute: 29 }, { team: "team-lyg", jersey: 9, minute: 55 }],
    referee: "Arbitwason Métellus", competitionId: comp.id, compName: COMP_NAME, playerIds });

  // Matchday 2 (finished)
  await seedFinishedMatch({ id: "m-a3", matchday: 2, groupId: groups.A, groupLabel: "A",
    home: "team-pot", away: "team-okp", hs: 1, as: 1, kickoff: new Date(ago(6, 16)), venue: "Stad Silvio Cator",
    goals: [{ team: "team-pot", jersey: 10, minute: 16 }, { team: "team-okp", jersey: 9, minute: 42 }],
    cards: [{ team: "team-pot", jersey: 3, minute: 33 }, { team: "team-okp", jersey: 6, minute: 52 }],
    referee: "Arbitwason Cadet", competitionId: comp.id, compName: COMP_NAME, playerIds });
  await seedFinishedMatch({ id: "m-a4", matchday: 2, groupId: groups.A, groupLabel: "A",
    home: "team-jkm", away: "team-sgn", hs: 2, as: 2, kickoff: new Date(ago(6, 18)), venue: "Stad Jakmèl",
    goals: [{ team: "team-jkm", jersey: 7, minute: 6 }, { team: "team-sgn", jersey: 9, minute: 24 }, { team: "team-jkm", jersey: 9, minute: 39 }, { team: "team-sgn", jersey: 10, minute: 58 }],
    referee: "Arbitwason Fortuné", competitionId: comp.id, compName: COMP_NAME, playerIds });
  await seedFinishedMatch({ id: "m-b3", matchday: 2, groupId: groups.B, groupLabel: "B",
    home: "team-kfd", away: "team-lyg", hs: 0, as: 2, kickoff: new Date(ago(5, 16)), venue: "Terenn Kafou",
    goals: [{ team: "team-lyg", jersey: 9, minute: 31 }, { team: "team-lyg", jersey: 10, minute: 49 }],
    referee: "Arbitwason Éstimé", competitionId: comp.id, compName: COMP_NAME, playerIds });
  await seedFinishedMatch({ id: "m-b4", matchday: 2, groupId: groups.B, groupLabel: "B",
    home: "team-sdk", away: "team-rjm", hs: 3, as: 0, kickoff: new Date(ago(5, 18)), venue: "Stad René Delcour",
    goals: [{ team: "team-sdk", jersey: 9, minute: 9 }, { team: "team-sdk", jersey: 7, minute: 26 }, { team: "team-sdk", jersey: 10, minute: 53 }],
    referee: "Arbitwason Vilmé", competitionId: comp.id, compName: COMP_NAME, playerIds });

  // Matchday 3 — one LIVE right now
  const liveKick = new Date(now - 19 * 60 * 1000);
  await db.match.create({
    data: {
      id: "m-a5", competitionId: comp.id, matchday: 3,
      stage: "GROUP", groupId: groups.A, groupLabel: "A",
      homeTeamId: "team-pot", awayTeamId: "team-sgn",
      homeScore: 1, awayScore: 0,
      kickoff: liveKick, venue: "Stad Silvio Cator", competitionName: COMP_NAME,
      status: "AN_DIRÈK",
      referee: "Arbitwason Kadayi", commissioner: "Komisè FIFAYITI",
      clock: 17 * 60, half: "1", synced: true,
    },
  });
  await db.matchEvent.create({ data: { matchId: "m-a5", minute: 0, half: 1, kind: "KOMANSE", description: "Kòmansman match la" } });
  await db.matchEvent.create({ data: { matchId: "m-a5", minute: 12, half: 1, kind: "GOL", teamId: "team-pot", playerInId: playerIds["team-pot"]["9"], description: "Gòl! N°9 (POT)" } });
  await db.matchEvent.create({ data: { matchId: "m-a5", minute: 15, half: 1, kind: "KAT_JON", teamId: "team-sgn", playerInId: playerIds["team-sgn"]["2"], description: "Kat jòn pou N°2 (SGN)" } });

  // Matchday 3 — scheduled
  await db.match.create({ data: { id: "m-a6", competitionId: comp.id, matchday: 3, stage: "GROUP", groupId: groups.A, groupLabel: "A", homeTeamId: "team-jkm", awayTeamId: "team-okp", kickoff: new Date(now + 4 * HOUR), venue: "Stad Jakmèl", competitionName: COMP_NAME, status: "PWOGRAM", clock: 0, half: "PRE" } });
  await db.match.create({ data: { id: "m-b5", competitionId: comp.id, matchday: 3, stage: "GROUP", groupId: groups.B, groupLabel: "B", homeTeamId: "team-kfd", awayTeamId: "team-rjm", kickoff: new Date(now + 1 * DAY + 4 * HOUR), venue: "Terenn Kafou", competitionName: COMP_NAME, status: "PWOGRAM", clock: 0, half: "PRE" } });
  await db.match.create({ data: { id: "m-b6", competitionId: comp.id, matchday: 3, stage: "GROUP", groupId: groups.B, groupLabel: "B", homeTeamId: "team-sdk", awayTeamId: "team-lyg", kickoff: new Date(now + 1 * DAY + 6 * HOUR), venue: "Stad René Delcour", competitionName: COMP_NAME, status: "PWOGRAM", clock: 0, half: "PRE" } });

  // Replays for finished matches
  await seedReplay("m-a1", "GOL", 37, "Gòl bèl — Potoprens vs Jakmèl", "team-pot", playerIds["team-pot"]["7"]);
  await seedReplay("m-a1", "SAV", 28, "Sovèt gadyen Jakmèl", "team-jkm", playerIds["team-jkm"]["1"]);
  await seedReplay("m-a2", "GOL", 14, "Premye gòl Real Okap", "team-okp", playerIds["team-okp"]["9"]);
  await seedReplay("m-b2", "GOL", 55, "Gòl gayan Leyogàn SC", "team-lyg", playerIds["team-lyg"]["9"]);
  await seedReplay("m-b4", "KADON", 26, "Kadòn Sid Kay", "team-sdk", playerIds["team-sdk"]["7"]);
  await seedReplay("m-b3", "KAT", 49, "Kat jòn.nan nan match Kafou–Leyogàn");

  const [teams, players, matches, events, replays] = await Promise.all([
    db.team.count(), db.player.count(), db.match.count(),
    db.matchEvent.count(), db.replay.count(),
  ]);
  console.log(`Seed complete: ${teams} teams, ${players} players, ${matches} matches, ${events} events, ${replays} replays`);
  console.log(`Competition: ${COMP_NAME} (IN_PROGRESS — 2 groups, live match m-a5)`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
