"use client";
import { useEffect, useMemo, useState, useRef } from "react";
import { useAppStore } from "@/store/app-store";
import { useToast } from "@/hooks/use-toast";
import {
  type MatchEventKind,
  type Match,
} from "@/lib/fifayiti-data";
import { Play, Megaphone, Loader2 } from "lucide-react";
import {
  type LocalEvent,
  KIND_META,
  NO_TEAM_KINDS,
  buildDescription,
} from "./types";
import { MatchSyncStatus } from "./sync-status";
import { MatchScoreboard, MatchPickerCard } from "./scoreboard";
import { MatchControlHeader } from "./header";
import { MatchPhaseControls } from "./phase-controls";
import { MatchEventControls } from "./event-controls";
import { MatchEventDialog } from "./event-dialog";
import { MatchEventTimeline } from "./event-timeline";
import { MatchCorrectionDialog } from "./correction-dialog";

const HALF_LENGTH_SECONDS = 30 * 60; // 30 minutes per half

/** Format seconds as M:SS or MM:SS */
function fmtClock(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

interface TeamData {
  id: string;
  name: string;
  shortName: string;
  primaryColor: string;
  secondaryColor: string;
  logoUrl?: string | null;
  players?: any[];
}

interface MatchData {
  id: string;
  matchday: number;
  groupLabel?: string | null;
  stage?: string;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
  kickoff: string;
  venue?: string | null;
  competition?: string;
  status: string;
  referee?: string | null;
  commissioner?: string | null;
  clock: number;
  half: string; // "PRE" | "1" | "HT" | "2" | "POST"
  events: any[];
  replayIds: string[];
  synced: boolean;
}

/**
 * MatchControlPage — operational screen used during a live match.
 *
 * CHRONOMETER MODE:
 *   - When operator clicks "Kòmanse": clock starts counting UP from 0:00
 *   - When clock reaches 30:00 in the first half, it AUTO-STOPS and sets
 *     half="HT" (half-time). Operator must manually click "Dezyèm mitan"
 *     to start the second half.
 *   - When clock reaches 30:00 in the second half, it AUTO-STOPS and sets
 *     half="POST" + status="FINI".
 *   - Operator can click "Fen match" at any time to end the match early.
 *
 * All state changes are persisted to the DB via the /api/matches/[id]/phase
 * endpoint (action: "tick" | "start" | "half_time" | "second_half" | "end").
 */
export function MatchControlPage() {
  const {
    activeMatchId,
    setActiveMatchId,
    online,
    setOnline,
    pendingSync,
    setPendingSync,
  } = useAppStore();
  const { toast } = useToast();

  const [match, setMatch] = useState<MatchData | null>(null);
  const [home, setHome] = useState<TeamData | null>(null);
  const [away, setAway] = useState<TeamData | null>(null);
  const [homePlayers, setHomePlayers] = useState<any[]>([]);
  const [awayPlayers, setAwayPlayers] = useState<any[]>([]);
  const [events, setEvents] = useState<LocalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const [openEvent, setOpenEvent] = useState<MatchEventKind | null>(null);
  const [selectedTeam, setSelectedTeam] = useState<string>("");
  const [selectedPlayerIn, setSelectedPlayerIn] = useState<string>("");
  const [selectedPlayerOut, setSelectedPlayerOut] = useState<string>("");
  const [correctionTarget, setCorrectionTarget] = useState<LocalEvent | null>(null);
  const [correctionReason, setCorrectionReason] = useState<string>("");
  const [actionLoading, setActionLoading] = useState(false);

  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastTickSync = useRef<number>(Date.now());

  const appendEventLocal = (ev: LocalEvent) => {
    setEvents((prev) => [ev, ...prev]);
  };

  const loadMatch = async (id: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/matches/${id}`);
      if (!res.ok) throw new Error("match not found");
      const data = await res.json();
      const m = data.match as MatchData;
      setMatch(m);
      setEvents((m.events ?? []).map((e) => ({ ...e }) as LocalEvent));

      const [homeRes, awayRes] = await Promise.all([
        fetch(`/api/teams/${m.homeTeamId}`).then((r) => r.json()),
        fetch(`/api/teams/${m.awayTeamId}`).then((r) => r.json()),
      ]);
      setHome(homeRes.team);
      setAway(awayRes.team);
      setHomePlayers(homeRes.team?.players ?? []);
      setAwayPlayers(awayRes.team?.players ?? []);

      if (m.status === "AN_DIRÈK" && (m.half === "1" || m.half === "2")) {
        setRunning(true);
      } else {
        setRunning(false);
      }
    } catch {
      setMatch(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        if (activeMatchId) {
          await loadMatch(activeMatchId);
          return;
        }
        const res = await fetch("/api/matches");
        const data = await res.json();
        const all = data.matches as MatchData[];
        const live = all.find((m) => m.status === "AN_DIRÈK");
        const upcoming = all
          .filter((m) => m.status === "PWOGRAM")
          .sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime());
        const target = live ?? upcoming[0];
        if (target) {
          setActiveMatchId(target.id);
          await loadMatch(target.id);
        } else {
          setMatch(null);
        }
      } catch {
        setMatch(null);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!running || !match) return;
    tickRef.current = setInterval(async () => {
      if (!match) return;
      const newClock = (match.clock ?? 0) + 1;
      if (match.half === "1" && newClock >= HALF_LENGTH_SECONDS) {
        setMatch({ ...match, clock: HALF_LENGTH_SECONDS, half: "HT" });
        setRunning(false);
        try {
          await fetch(`/api/matches/${match.id}/phase`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "half_time" }),
          });
        } catch {}
        appendEventLocal({
          id: `ev-local-${Date.now()}`,
          matchId: match.id,
          minute: 30,
          half: 1,
          kind: "MWATYE_TAN",
          description: "Mwatye tan — chronometer kanpe a 30:00",
          recordedBy: "operator",
          recordedAt: new Date().toISOString(),
        });
        toast({
          title: "Mwatye tan",
          description: "Premye mitan kanpe a 30:00. Klike 'Dezyèm mitan' pou kontinye.",
        });
        return;
      }
      if (match.half === "2" && newClock >= HALF_LENGTH_SECONDS) {
        setMatch({ ...match, clock: HALF_LENGTH_SECONDS, half: "POST", status: "FINI" });
        setRunning(false);
        try {
          await fetch(`/api/matches/${match.id}/phase`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "end" }),
          });
        } catch {}
        appendEventLocal({
          id: `ev-local-${Date.now()}`,
          matchId: match.id,
          minute: 30,
          half: 2,
          kind: "FEN_MATCH",
          description: "Fen match — chronometer kanpe a 30:00",
          recordedBy: "operator",
          recordedAt: new Date().toISOString(),
        });
        toast({
          title: "Fen match",
          description: "Dezyèm mitan kanpe a 30:00. Match fini.",
        });
        return;
      }
      setMatch({ ...match, clock: newClock });
      const now = Date.now();
      if (now - lastTickSync.current > 3000) {
        lastTickSync.current = now;
        try {
          await fetch(`/api/matches/${match.id}/phase`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "tick" }),
          });
        } catch {}
      }
    }, 1000);
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [running, match]);

  const resetSelections = () => {
    setSelectedTeam("");
    setSelectedPlayerIn("");
    setSelectedPlayerOut("");
  };

  const switchMatch = async (id: string) => {
    setActiveMatchId(id);
    setRunning(false);
    await loadMatch(id);
  };

  const triggerPhase = async (kind: MatchEventKind) => {
    if (!match) return;
    setActionLoading(true);
    try {
      const action =
        kind === "KOMANSE" ? "start"
        : kind === "MWATYE_TAN" ? "half_time"
        : kind === "DEZYEM_MITAN" ? "second_half"
        : kind === "FEN_MATCH" ? "end"
        : null;
      if (!action) return;

      const res = await fetch(`/api/matches/${match.id}/phase`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) throw new Error("echwe");
      const data = await res.json();
      setMatch(data.match);

      appendEventLocal({
        id: `ev-local-${Date.now()}`,
        matchId: match.id,
        minute: Math.floor((data.match.clock ?? 0) / 60),
        half: data.match.half === "2" ? 2 : 1,
        kind,
        description: buildDescription(kind),
        recordedBy: "operator",
        recordedAt: new Date().toISOString(),
      });

      if (kind === "KOMANSE") {
        setRunning(true);
        toast({ title: "Match kòmanse", description: "Premye mitan — chronometer ap konte" });
      } else if (kind === "MWATYE_TAN") {
        setRunning(false);
        toast({ title: "Mwatye tan", description: "Premye mitan kanpe" });
      } else if (kind === "DEZYEM_MITAN") {
        setRunning(true);
        toast({ title: "Dezyèm mitan kòmanse", description: "Chronometer ap konte" });
      } else if (kind === "FEN_MATCH") {
        setRunning(false);
        toast({ title: "Fen match", description: "Match fini" });
      }
    } catch (e: any) {
      toast({ title: "Erè", description: e.message, variant: "destructive" });
    } finally {
      setActionLoading(false);
    }
  };

  const confirmEvent = async () => {
    if (!openEvent || !match || !home || !away) return;
    const kind = openEvent;
    const meta = KIND_META[kind];
    const playerObj = selectedPlayerIn
      ? [...homePlayers, ...awayPlayers].find((p) => p.id === selectedPlayerIn)
      : undefined;
    const playerOutObj = selectedPlayerOut
      ? [...homePlayers, ...awayPlayers].find((p) => p.id === selectedPlayerOut)
      : undefined;
    const team = selectedTeam === home.id ? home : selectedTeam === away.id ? away : undefined;
    const isNoTeam = NO_TEAM_KINDS.includes(kind);

    const minute = Math.floor((match.clock ?? 0) / 60);
    const halfNum = match.half === "2" ? 2 : 1;

    setActionLoading(true);
    try {
      const res = await fetch(`/api/matches/${match.id}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          teamId: isNoTeam ? undefined : selectedTeam || undefined,
          playerInId: isNoTeam ? undefined : selectedPlayerIn || undefined,
          playerOutId: kind === "RANPLASMAN" ? selectedPlayerOut || undefined : undefined,
          minute,
          half: halfNum,
          description: buildDescription(
            kind,
            team as any,
            playerObj as any,
            playerOutObj as any
          ),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "echwe");
      }
      const data = await res.json();
      if (data.match) setMatch(data.match);
      appendEventLocal({
        id: data.event?.id ?? `ev-local-${Date.now()}`,
        matchId: match.id,
        minute,
        half: halfNum,
        kind,
        teamId: isNoTeam ? undefined : selectedTeam || undefined,
        playerInId: isNoTeam ? undefined : selectedPlayerIn || undefined,
        playerOutId: kind === "RANPLASMAN" ? selectedPlayerOut || undefined : undefined,
        description: buildDescription(
          kind,
          team as any,
          playerObj as any,
          playerOutObj as any
        ),
        recordedBy: "operator",
        recordedAt: new Date().toISOString(),
      });

      toast({
        title: `${meta.label} — ${minute}'`,
        description: buildDescription(kind, team as any, playerObj as any, playerOutObj as any),
      });
      setOpenEvent(null);
      resetSelections();
    } catch (e: any) {
      toast({ title: "Erè", description: e.message, variant: "destructive" });
    } finally {
      setActionLoading(false);
    }
  };

  const confirmCorrection = () => {
    if (!correctionTarget) return;
    setEvents(
      events.map((e) =>
        e.id === correctionTarget.id
          ? { ...e, corrected: true, correctionNote: correctionReason || "Evenman anile/korije." }
          : e
      )
    );
    if (correctionTarget.kind === "GOL" && match) {
      if (correctionTarget.teamId === home?.id) {
        setMatch({ ...match, homeScore: Math.max(0, match.homeScore - 1) });
      } else if (correctionTarget.teamId === away?.id) {
        setMatch({ ...match, awayScore: Math.max(0, match.awayScore - 1) });
      }
    }
    toast({
      title: "Koreksyon anrejistre",
      description: `Evenman "${KIND_META[correctionTarget.kind].label}" korije.`,
      variant: "destructive",
    });
    setCorrectionTarget(null);
    setCorrectionReason("");
  };

  const toggleOffline = () => {
    if (online) {
      setOnline(false);
      setPendingSync(0);
      toast({ title: "Mode offline aktif", description: "Chanjman yo ap mete an atant." });
    } else {
      const queued = pendingSync;
      setOnline(true);
      setPendingSync(0);
      toast({ title: "Senkronize", description: `${queued} evenman senkronize.` });
    }
  };

  if (loading) {
    return (
      <div className="fifayiti-card border-dashed border-[#E4E7EC] p-10 text-center">
        <Loader2 size={28} className="mx-auto text-[#116B3A] animate-spin" />
        <p className="mt-2 heading-md text-[#084C2A]">Ap charger match yo...</p>
      </div>
    );
  }

  if (!match || !home || !away) {
    return (
      <div className="fifayiti-card border-dashed border-[#E4E7EC] p-10 text-center">
        <Megaphone size={28} className="mx-auto text-[#E4E7EC]" />
        <p className="mt-2 heading-md text-[#084C2A]">Pa gen match pou kontwole</p>
        <p className="mt-1 meta text-[#667085]">
          Prezidan oswa Direktè Konpetisyon pwogram match yo nan paj Orè a.
        </p>
      </div>
    );
  }

  const isLive = match.status === "AN_DIRÈK";

  return (
    <div className="space-y-5">
      <MatchSyncStatus online={online} pendingSync={pendingSync} onToggle={toggleOffline} />

      <section className="fifayiti-card overflow-hidden">
        <div className="p-4 md:p-6">
          <MatchScoreboard
            match={match as any}
            home={home as any}
            away={away as any}
            scoreHome={match.homeScore}
            scoreAway={match.awayScore}
            clock={match.clock}
            half={match.half as Match["half"]}
            isLive={isLive}
            running={running}
            onFormatClock={fmtClock}
          />
          <MatchControlHeader match={match as any} />
        </div>
      </section>

      {!isLive && <UpcomingPicker onPick={switchMatch} />}

      <MatchPhaseControls
        onPick={(kind) => triggerPhase(kind)}
        disabled={actionLoading}
        currentHalf={match.half}
        isLive={isLive}
        running={running}
      />

      <MatchEventControls
        onPick={(kind) => {
          setOpenEvent(kind);
          resetSelections();
        }}
        disabled={!isLive}
      />

      <MatchEventTimeline
        events={events}
        onCorrect={(e) => {
          setCorrectionTarget(e);
          setCorrectionReason("");
        }}
      />

      <MatchEventDialog
        open={openEvent !== null}
        kind={openEvent}
        match={match as any}
        home={home as any}
        away={away as any}
        selectedTeam={selectedTeam}
        selectedPlayerIn={selectedPlayerIn}
        selectedPlayerOut={selectedPlayerOut}
        clock={Math.floor((match.clock ?? 0) / 60)}
        homePlayers={homePlayers}
        awayPlayers={awayPlayers}
        onSelectTeam={setSelectedTeam}
        onSelectPlayerIn={setSelectedPlayerIn}
        onSelectPlayerOut={setSelectedPlayerOut}
        onClose={() => {
          setOpenEvent(null);
          resetSelections();
        }}
        onConfirm={confirmEvent}
      />

      <MatchCorrectionDialog
        open={correctionTarget !== null}
        target={correctionTarget}
        reason={correctionReason}
        onReasonChange={setCorrectionReason}
        onClose={() => {
          setCorrectionTarget(null);
          setCorrectionReason("");
        }}
        onConfirm={confirmCorrection}
      />
    </div>
  );
}

function UpcomingPicker({ onPick }: { onPick: (id: string) => void }) {
  const [upcoming, setUpcoming] = useState<MatchData[]>([]);
  const [teams, setTeams] = useState<Record<string, TeamData>>({});
  const [open, setOpen] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/matches");
        const data = await res.json();
        const all = data.matches as MatchData[];
        const up = all
          .filter((m) => m.status === "PWOGRAM")
          .sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime());
        setUpcoming(up);
        const tRes = await fetch("/api/teams");
        const tData = await tRes.json();
        const map: Record<string, TeamData> = {};
        for (const t of tData.teams ?? []) map[t.id] = t;
        setTeams(map);
      } catch {}
    })();
  }, []);

  if (!open || upcoming.length === 0) return null;

  return (
    <section
      className="fifayiti-card border-dashed border-[#F4C400] p-4"
      style={{ borderColor: "#F4C400", background: "rgba(244,196,0,0.05)" }}
    >
      <p className="eyebrow text-[#084C2A] mb-2 inline-flex items-center gap-1.5">
        <Play size={11} /> Chwazi match pou kòmanse
      </p>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {upcoming.map((m) => {
          const h = teams[m.homeTeamId];
          const a = teams[m.awayTeamId];
          return (
            <MatchPickerCard
              key={m.id}
              homeShort={h?.shortName ?? "???"}
              awayShort={a?.shortName ?? "???"}
              kickoff={m.kickoff}
              venue={m.venue ?? ""}
              onClick={() => {
                onPick(m.id);
                setOpen(false);
              }}
            />
          );
        })}
      </div>
    </section>
  );
}
