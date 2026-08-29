"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import { useAppStore } from "@/store/app-store";
import { Room, RoomEvent, RemoteTrack, Track } from "livekit-client";
import {
  Play, Tv, ChevronRight, Calendar, MapPin, Clock,
  Radio, Star, Users, Maximize2, Minimize2, RotateCcw, RotateCw, Pause,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ScoreBug } from "@/components/fifayiti/scorebug";
import { BroadcastPlayer } from "@/components/fifayiti/tv/broadcast-player";
import { BroadcastOverlay, type OverlayEvent } from "@/components/fifayiti/tv/broadcast-overlay";
import { WebrtcDvrBar } from "@/components/fifayiti/tv/webrtc-dvr-bar";
import { ClientReplayEngine, type ReplayEngineState } from "@/lib/replay/client-replay-engine";
import { useIsMobile } from "@/hooks/use-mobile";

interface TeamData {
  id: string; name: string; shortName: string;
  primaryColor: string; secondaryColor: string;
  logoUrl?: string | null; group: string; players?: any[];
}
interface MatchData {
  id: string; matchday: number; stage: string;
  homeTeamId: string; awayTeamId: string;
  homeScore: number; awayScore: number;
  kickoff: string; venue?: string | null;
  competitionName?: string; competition?: string;
  status: string; clock?: number; half?: string;
}
interface CompetitionData {
  id: string; name: string; season: string; status: string;
}
interface RoomState {
  metadata?: { selectedSlot: number | null; matchData: any };
}

import { LIVEKIT_WS_URL as WS_URL } from "@/lib/streaming/livekit-config";
const ROOM_NAME = "fifayiti-broadcast";

const fmtDate = (iso: string) => {
  try {
    const d = new Date(iso);
    const days = ["Dimanch","Lendi","Madi","Mèkredi","Jedi","Vandredi","Samdi"];
    const months = ["Jan","Fev","Mar","Avr","Me","Jun","Jul","Out","Sep","Okt","Nov","Des"];
    return `${days[d.getDay()]} · ${d.getDate()} ${months[d.getMonth()]}`;
  } catch { return ""; }
};
const fmtTime = (iso: string) => {
  try { return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }); }
  catch { return ""; }
};

// TeamCrest — uses the transparent-background shield PNG.
// Team color is masked by the shield's own alpha channel (so the color
// fills ONLY the shield shape), and the shield outline is overlaid on top.
function TeamCrest({ team, size = 40 }: { team?: TeamData; size?: number }) {
  // Shield PNG aspect ratio is roughly 0.83 (portrait)
  const height = size * 1.21;
  const fontSize = size * 0.25;

  if (team?.logoUrl) {
    return (
      <img
        src={team.logoUrl}
        alt={team.name}
        style={{ height, width: "auto" }}
        className="object-contain shrink-0"
      />
    );
  }

  return (
    <div className="relative shrink-0" style={{ width: size, height }}>
      {/* Layer 1 — team color, masked by the shield's alpha */}
      <div
        className="absolute inset-0"
        style={{
          background: team?.primaryColor ?? "#0B6B3A",
          WebkitMaskImage: "url(/shield-crest.png)",
          maskImage: "url(/shield-crest.png)",
          WebkitMaskSize: "contain",
          maskSize: "contain",
          WebkitMaskRepeat: "no-repeat",
          maskRepeat: "no-repeat",
          WebkitMaskPosition: "center",
          maskPosition: "center",
        }}
      />
      {/* Layer 2 — shield outline on top (transparent outside, opaque inside) */}
      <img
        src="/shield-crest.png"
        alt=""
        className="absolute inset-0 w-full h-full object-contain pointer-events-none"
      />
      {/* Layer 3 — team abbreviation text */}
      <div
        className="absolute inset-0 flex items-center justify-center font-extrabold"
        style={{
          fontSize,
          color: team?.secondaryColor ?? "#fff",
          fontFamily: "var(--font-archivo), var(--font-manrope), sans-serif",
          letterSpacing: "-0.02em",
          // Slight bottom bias so the text sits visually centered inside the
          // shield body (shields usually have a pointed bottom)
          paddingBottom: size * 0.08,
        }}
      >
        {(team?.shortName ?? "?").slice(0,3).toUpperCase()}
      </div>
    </div>
  );
}

export function HomePage() {
  const { setView, setActiveMatchId, setActiveTeamId } = useAppStore();
  const isMobile = useIsMobile();
  const [liveMatch, setLiveMatch] = useState<MatchData | null>(null);
  const [upcoming, setUpcoming] = useState<MatchData[]>([]);
  const [finished, setFinished] = useState<MatchData[]>([]);
  const [teams, setTeams] = useState<TeamData[]>([]);
  const [competition, setCompetition] = useState<CompetitionData | null>(null);
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [loading, setLoading] = useState(true);
  const [countdown, setCountdown] = useState("");
  const [hasVideo, setHasVideo] = useState(false);
  // HLS/DVR broadcast player state (Task 16). When the egress pipeline is
  // ready, the hero switches from direct-WebRTC to the HLS BroadcastPlayer
  // (~3s controlled latency + DVR controls). This is where most viewers
  // actually watch — the player buttons live here too.
  const [hlsSrc, setHlsSrc] = useState<string | null>(null);
  // Active broadcast instant replay (goal replay) — polled every 2s.
  const [replayActive, setReplayActive] = useState<{
    url: string; kind: string; endsAt: number;
  } | null>(null);
  // Live viewer count (other LiveKit participants with role=viewer).
  const [viewerCount, setViewerCount] = useState(0);
  // Fullscreen state — toggled by the DVR bar's fullscreen button.
  const [isFullscreen, setIsFullscreen] = useState(false);
  // Client-side replay engine state — drives the YouTube-style DVR bar
  // (pause / ±10s / scrub / RETOUNEN LIVE) on the WebRTC path.
  const [replayState, setReplayState] = useState<ReplayEngineState | null>(null);

  const roomRef = useRef<Room | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const currentTrackRef = useRef<RemoteTrack | null>(null);
  // Container of the TV hero — needed for requestFullscreen + DVR bar
  // auto-hide wake-on-pointermove.
  const tvContainerRef = useRef<HTMLDivElement>(null);
  // The replay engine instance + the dedicated <video> element it renders
  // into. Same wiring pattern as tv-page.tsx — the LIVE <video> keeps
  // running (hidden) while the replay <video> takes over the screen.
  const replayEngineRef = useRef<ClientReplayEngine | null>(null);
  const replayVideoRef = useRef<HTMLVideoElement>(null);
  const hlsSrcRef = useRef<string | null>(null);
  useEffect(() => { hlsSrcRef.current = hlsSrc; }, [hlsSrc]);

  // ── Live data polling ────────────────────────────────────────────
  // Scores/schedule refresh every 10s so operator work (gòl, kat, fen
  // match…) appears on the site WITHOUT a manual reload — previously
  // this fetched once at mount and froze until F5.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [mRes, tRes, cRes] = await Promise.all([
          fetch("/api/matches", { cache: "no-store" }).then(r => r.json()),
          fetch("/api/teams", { cache: "no-store" }).then(r => r.json()),
          fetch("/api/competitions/active", { cache: "no-store" }).then(r => r.json()),
        ]);
        if (cancelled) return;
        const all = (mRes.matches ?? []) as MatchData[];
        setLiveMatch(all.find(m => m.status === "AN_DIRÈK") ?? null);
        setUpcoming(all.filter(m => m.status === "PWOGRAM").sort((a,b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime()));
        setFinished(all.filter(m => m.status === "FINI").sort((a,b) => new Date(b.kickoff).getTime() - new Date(a.kickoff).getTime()));
        setTeams(tRes.teams ?? []);
        setCompetition(cRes.competition ?? null);
      } catch {} finally { if (!cancelled) setLoading(false); }
    };
    load();
    const i = setInterval(load, 10000);
    const onVisible = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(i);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch("/api/livekit-room?roomName=fifayiti-broadcast", { cache: "no-store" });
        if (res.ok) setRoomState(await res.json());
      } catch {}
    };
    check(); const i = setInterval(check, 3000);
    return () => clearInterval(i);
  }, []);

  const selectedSlot = roomState?.metadata?.selectedSlot ?? null;
  const isBroadcasting = selectedSlot !== null;
  // Broadcast overlay event (Task 18) — from the room state poll
  const overlayEvent = roomState?.metadata?.overlay ?? null;
  // Keep latest selectedSlot in a ref so LiveKit handlers read fresh value
  const selectedSlotRef = useRef<number | null>(null);
  useEffect(() => { selectedSlotRef.current = selectedSlot; }, [selectedSlot]);

  // ── Instant Replay engine (goal replay + client-side DVR) ────────────
  // Records the PROGRAM FEED (operator-selected camera) into a 60s rolling
  // buffer; on operator-confirmed GOL it plays 5s @1× → same clip @0.5× →
  // back to LIVE. Same buffer powers the YouTube-style DVR controls on the
  // WebRTC path (pause / ±10s / scrub / RETOUNEN LIVE).
  useEffect(() => {
    const eng = new ClientReplayEngine({ onState: setReplayState });
    replayEngineRef.current = eng;
    (window as any).__fifayitiReplayEngine = eng; // test/debug hook
    return () => {
      eng.destroy();
      replayEngineRef.current = null;
      delete (window as any).__fifayitiReplayEngine;
    };
  }, []);
  // Keep element refs fresh across branch switches (HLS ↔ WebRTC) and
  // whenever the live element mounts/unmounts with the broadcast state.
  useEffect(() => {
    replayEngineRef.current?.attachReplayVideo(replayVideoRef.current);
    replayEngineRef.current?.attachLiveVideo(videoRef.current);
  });

  // Attach ONLY the operator-selected camera's video to the hero player
  const attachTrack = (track: RemoteTrack) => {
    if (currentTrackRef.current && videoRef.current) currentTrackRef.current.detach(videoRef.current);
    currentTrackRef.current = track;
    if (videoRef.current) { track.attach(videoRef.current); setHasVideo(true); }
    // Feed the replay engine's rolling buffer — the program feed IS the
    // operator-selected camera (switches restart the recorder seamlessly,
    // preserving the true broadcast timeline).
    try { replayEngineRef.current?.setSource((track as any).mediaStreamTrack ?? null); } catch {}
  };
  // ── Instant replay polling (broadcast event, not archive) ─────────
  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch("/api/replay-broadcast", { cache: "no-store" });
        if (!res.ok) return;
        const d = await res.json();
        // NOTE: never compare endsAt with the CLIENT clock — phones with
        // skewed clocks would drop the replay early. The server lazily
        // expires the state; the player also returns on the video 'ended'
        // event, which is the real authority.
        if (d.active && d.url) {
          setReplayActive({ url: d.url, kind: d.kind ?? "GOL", endsAt: d.endsAt });
        } else {
          setReplayActive(null);
        }
      } catch {}
    };
    poll();
    const i = setInterval(poll, 2000);
    return () => clearInterval(i);
  }, []);

  // ── HLS/DVR status polling ────────────────────────────────────────
  useEffect(() => {
    const unsubAllVideo = () => {
      const room = roomRef.current;
      if (!room) return;
      for (const p of room.remoteParticipants.values()) {
        for (const pub of p.trackPublications.values()) {
          if (pub.kind === Track.Kind.Video && pub.isSubscribed) {
            try { pub.setSubscribed(false); } catch {}
          }
        }
      }
    };
    const poll = async () => {
      try {
        const res = await fetch("/api/livekit-hls", { cache: "no-store" });
        if (!res.ok) return;
        const d = await res.json();
        if (d.active && d.ready && d.url) {
          setHlsSrc((prev) => {
            if (prev == null) {
              // HLS carries the video now — stop downloading WebRTC tracks
              unsubAllVideo();
              return d.url;
            }
            return prev;
          });
        } else if (!d.active) {
          // Egress stopped (broadcast ended) → back to WebRTC fallback
          setHlsSrc(null);
        }
      } catch {}
    };
    poll();
    const i = setInterval(poll, 5000);
    return () => clearInterval(i);
  }, []);

  // Attach ONLY the operator-selected camera's video to the hero player.
  // Bandwidth-critical: with autoSubscribe:false we subscribe ONLY the
  // selected camera's video track and actively UNSUBSCRIBE every other
  // video track — viewers on weak Haitian mobile data must never download
  // all 3 camera feeds at once.
  const scanForSelected = () => {
    const room = roomRef.current;
    if (!room) return;
    for (const p of room.remoteParticipants.values()) {
      try {
        const meta = JSON.parse(p.metadata || "{}");
        const isSelected = !!meta.slot && meta.slot === selectedSlotRef.current;
        for (const pub of p.trackPublications.values()) {
          if (pub.kind !== Track.Kind.Video) continue;
          if (isSelected) {
            if (!pub.isSubscribed) pub.setSubscribed(true);
          } else if (pub.isSubscribed) {
            try { pub.setSubscribed(false); } catch {}
          }
        }
        if (isSelected) {
          for (const pub of p.trackPublications.values()) {
            if (pub.track && pub.track.kind === Track.Kind.Video) { attachTrack(pub.track); return; }
          }
        }
      } catch {}
    }
  };

  // Safety net: if a track was stored before the <video> element was mounted
  // (e.g. the live state appeared before React committed the element), attach
  // it as soon as the element becomes available in the DOM.
  useEffect(() => {
    if (!hasVideo && videoRef.current && currentTrackRef.current) {
      try { currentTrackRef.current.attach(videoRef.current); setHasVideo(true); } catch {}
    }
  });

  useEffect(() => {
    if (!isBroadcasting) return;
    let cancelled = false;
    (async () => {
      try {
        const tokenRes = await fetch("/api/livekit-token", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roomName: ROOM_NAME, participantName: `home-viewer-${Date.now()}`, role: "viewer" }),
        });
        if (!tokenRes.ok) return;
        const { token, wsUrl } = await tokenRes.json();
        const room = new Room({ adaptiveStream: true, autoSubscribe: false });
        roomRef.current = room;
        room.on(RoomEvent.TrackSubscribed, (track, _pub, participant) => {
          if (cancelled || track.kind !== Track.Kind.Video) return;
          try {
            const meta = JSON.parse(participant.metadata || "{}");
            if (meta.slot && meta.slot === selectedSlotRef.current) attachTrack(track);
          } catch {}
        });
        room.on(RoomEvent.ParticipantMetadataChanged, (_id, metadata, participant) => {
          if (!metadata) return;
          try {
            const meta = JSON.parse(metadata);
            if (meta.slot && meta.role === "cameraman") scanForSelected();
          } catch {}
        });
        room.on(RoomEvent.TrackUnsubscribed, (track) => {
          // If the on-air track went away, try to re-attach from remaining cams
          if (currentTrackRef.current === track) {
            currentTrackRef.current = null;
            setHasVideo(false);
            replayEngineRef.current?.setSource(null);
            scanForSelected();
          }
        });
        room.on(RoomEvent.ParticipantConnected, () => updateViewerCount());
        room.on(RoomEvent.ParticipantDisconnected, () => updateViewerCount());
        // Instant replay broadcasts from the server (operator confirmed
        // GOL etc). On the WebRTC path the client rolling-buffer engine
        // plays the sealed clip; on the HLS path (rare on Vercel) the
        // BroadcastPlayer handles it via a window event.
        room.on(RoomEvent.DataReceived, (payload: Uint8Array) => {
          try {
            const msg = JSON.parse(new TextDecoder().decode(payload));
            if (msg?.type !== "instant-replay") return;
            if (hlsSrcRef.current) {
              window.dispatchEvent(new CustomEvent("fifayiti:instant-replay", { detail: msg }));
            } else {
              replayEngineRef.current?.trigger(msg);
            }
          } catch {}
        });
        await room.connect(wsUrl, token);
        room.localParticipant.setMetadata(JSON.stringify({ role: "viewer" }));
        scanForSelected();
        updateViewerCount();
      } catch (e) { console.error("[home] livekit error:", e); }
    })();
    return () => { cancelled = true; if (roomRef.current) roomRef.current.disconnect(); };
  }, [isBroadcasting]);

  const updateViewerCount = () => {
    const room = roomRef.current;
    if (!room) return;
    let v = 0;
    for (const p of room.remoteParticipants.values()) {
      try { if (JSON.parse(p.metadata || "{}").role === "viewer") v++; } catch {}
    }
    setViewerCount(v);
  };

  // Hot-switch: when the operator changes camera slot, re-attach immediately
  useEffect(() => {
    if (!isBroadcasting) return;
    scanForSelected();
  }, [selectedSlot, isBroadcasting]);

  // Reset the video flags whenever the broadcast goes off air, so a stale
  // hasVideo=true can never resurrect a frozen frame on the next broadcast.
  useEffect(() => {
    if (!isBroadcasting) {
      currentTrackRef.current = null;
      setHasVideo(false);
      replayEngineRef.current?.setSource(null); // broadcast off → stop buffering
    }
  }, [isBroadcasting]);

  // ── Fullscreen (TV hero only) ────────────────────────────────────────
  // The DVR bar's fullscreen button calls this. Locks to landscape on
  // mobile so the 16:9 feed fills the screen.
  const toggleFullscreen = useCallback(async () => {
    if (!document.fullscreenElement) {
      try {
        await tvContainerRef.current?.requestFullscreen?.();
        const o = (screen as any).orientation;
        if (o?.lock) try { await o.lock("landscape"); } catch {}
        setIsFullscreen(true);
      } catch {}
    } else {
      try {
        await document.exitFullscreen?.();
        const o = (screen as any).orientation;
        if (o?.unlock) try { await o.unlock(); } catch {}
        setIsFullscreen(false);
      } catch {}
    }
  }, []);
  useEffect(() => {
    const f = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", f);
    return () => document.removeEventListener("fullscreenchange", f);
  }, []);

  useEffect(() => {
    const next = upcoming[0];
    if (!next) { setCountdown(""); return; }
    const update = () => {
      const diff = new Date(next.kickoff).getTime() - Date.now();
      if (diff <= 0) { setCountdown(""); return; }
      const h = Math.floor(diff / 3600000), m = Math.floor((diff % 3600000) / 60000), s = Math.floor((diff % 60000) / 1000);
      setCountdown(`${String(h).padStart(2,"0")} : ${String(m).padStart(2,"0")} : ${String(s).padStart(2,"0")}`);
    };
    update(); const i = setInterval(update, 1000);
    return () => clearInterval(i);
  }, [upcoming]);

  const teamById = (id: string) => teams.find(t => t.id === id);
  const matchData = roomState?.metadata?.matchData;
  // The TV is "live" ONLY while the operator actually has a camera on air
  // (selectedSlot set). A DB match with status AN_DIRÈK but no active
  // broadcast must NOT render a live state — that was the "AN DIRÈK with
  // no video" phantom: the operator stopped the feed / unselected the
  // match, but the homepage kept showing a live placeholder because the
  // DB match status was still AN_DIRÈK.
  const isLiveBroadcasting = isBroadcasting;
  const tvState: "live" | "upcoming" | "empty" =
    isLiveBroadcasting ? "live" : (upcoming.length > 0 ? "upcoming" : "empty");
  const nextMatch = upcoming[0];
  const lastMatch = finished[0];

  if (loading) {
    return (
      <div className="bg-[#064E2A] min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#F4C400] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#064E2A]">
      {/* ═══ FIFAYITI TV — THE HERO ═══ */}
      <section className="bg-pitch-texture-dark">
        <div className="max-w-[1400px] mx-auto px-4 pt-3 pb-5">

          {/* FIFAYITI TV identity */}
          <div className="flex items-center gap-2 mb-2.5">
            <div className="flex items-center justify-center w-7 h-7 rounded-md bg-[#F4C400]">
              <Tv size={15} className="text-[#064E2A]" />
            </div>
            <h1 className="text-sm lg:text-lg font-extrabold text-white tracking-tight">TV</h1>
          </div>

          {/* TV Stage — cinematic ratio on mobile, 16:9 from md up, yellow border.
              Carries the DVR bar's fullscreen handler + replay <video>.
              On desktop (lg+) it sits inside a 2-column grid next to a 340px
              broadcast info sidebar (see <aside> below). */}
          <div className="lg:grid lg:grid-cols-[1fr_340px] lg:gap-5">
          <div
            ref={tvContainerRef}
            className={cn(
              "relative aspect-[18/9] md:aspect-video rounded-lg overflow-hidden bg-black",
              isFullscreen && "rounded-none aspect-auto h-screen w-screen"
            )}
            style={{ border: isFullscreen ? undefined : "2px solid #F4C400" }}
          >

            {/* ── STATE A: LIVE ── */}
            {tvState === "live" && (() => {
              const home = liveMatch ? teamById(liveMatch.homeTeamId) : undefined;
              const away = liveMatch ? teamById(liveMatch.awayTeamId) : undefined;
              // Scorebug data: prefer the operator's live matchData, fall back
              // to the DB liveMatch. Clock is in SECONDS — convert to minutes.
              const minute = Math.floor(((matchData?.clock ?? liveMatch?.clock) ?? 0) / 60);
              const bug = matchData
                ? {
                    homeShort: matchData.homeShort ?? home?.shortName ?? "???",
                    homeColor: matchData.homeColor ?? home?.primaryColor,
                    awayShort: matchData.awayShort ?? away?.shortName ?? "???",
                    awayColor: matchData.awayColor ?? away?.primaryColor,
                    homeScore: matchData.homeScore ?? 0,
                    awayScore: matchData.awayScore ?? 0,
                    minute,
                  }
                : liveMatch
                ? {
                    homeShort: home?.shortName ?? "???",
                    homeColor: home?.primaryColor,
                    awayShort: away?.shortName ?? "???",
                    awayColor: away?.primaryColor,
                    homeScore: liveMatch.homeScore ?? 0,
                    awayScore: liveMatch.awayScore ?? 0,
                    minute,
                  }
                : null;
              return (
                <>
                  {/* The <video> element is ALWAYS mounted while the live state
                      is active (hidden with CSS until frames arrive) so LiveKit
                      can attach the selected camera track to it. Previously it
                      was conditionally rendered only when hasVideo was true —
                      but hasVideo could only become true after attaching to
                      this element, which never existed. Deadlock fixed. */}
                  {hlsSrc ? (
                    /* ── HLS/DVR BroadcastPlayer (Task 16) ──
                       ~3s controlled latency + DVR timeline + controls.
                       Overlays (AN DIRÈK badge, scorebug) render on top. */
                    <BroadcastPlayer src={hlsSrc} replay={replayActive}>
                      <BroadcastOverlay event={overlayEvent} />
                      <div className="absolute top-2 right-2 md:top-3 md:right-3 z-10 flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#D92D20] shadow-md">
                        <span className="w-1 h-1 rounded-full bg-white animate-pulse" />
                        <span className="text-[8px] md:text-[9px] font-extrabold text-white uppercase tracking-wider">An Dirèk</span>
                      </div>
                      {bug && (
                        <div className="absolute top-2 left-2 md:top-3 md:left-3 z-10">
                          <ScoreBug
                            homeShort={bug.homeShort}
                            homeColor={bug.homeColor}
                            awayShort={bug.awayShort}
                            awayColor={bug.awayColor}
                            homeScore={bug.homeScore}
                            awayScore={bug.awayScore}
                            minute={bug.minute}
                          />
                        </div>
                      )}
                    </BroadcastPlayer>
                  ) : (
                  <>
                  <video
                    ref={videoRef}
                    autoPlay
                    muted
                    playsInline
                    className="w-full h-full object-cover"
                    style={{ display: hasVideo ? "block" : "none" }}
                  />
                  {/* Instant-replay <video> — plays the sealed clip from the
                      rolling buffer (5s @1× then the same clip @0.5×). The
                      LIVE element stays attached and running underneath
                      (visibility:hidden) so the swap back to live is
                      instantaneous and the WebRTC track never stalls. */}
                  <video
                    ref={replayVideoRef}
                    muted
                    playsInline
                    className="absolute inset-0 w-full h-full object-cover bg-black z-[5]"
                    style={{ display: replayState?.phase === "normal" || replayState?.phase === "slowmo" || replayState?.phase === "arming" || replayState?.dvr?.mode === "dvr" ? "block" : "none" }}
                    onTimeUpdate={() => replayEngineRef.current?.onTime()}
                    onEnded={() => replayEngineRef.current?.onEnded()}
                  />
                  {/* REPLAY badge — shows above the player while the engine
                      plays the sealed clip. Mirrors tv-page.tsx. */}
                  {(replayState?.phase === "arming" || replayState?.phase === "normal" || replayState?.phase === "slowmo") && (
                    <div className="absolute top-2 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#116B3A] shadow-lg">
                      <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                      <span className="text-[10px] font-extrabold text-white uppercase tracking-widest">Replay</span>
                      {replayState?.kind === "GOL" && <span className="text-[10px] font-bold text-white/80">⚽</span>}
                      <span className="text-[10px] font-bold text-white/70 tnum">
                        {replayState?.phase === "slowmo" ? "0.5×" : "1×"}
                      </span>
                    </div>
                  )}
                  {!hasVideo && (
                    <div className="absolute inset-0 bg-pitch-texture-dark flex items-center justify-center">
                      <div className="text-center">
                        <Radio size={20} className="mx-auto text-[#F4C400] mb-1.5" />
                        <p className="text-xs font-bold text-white">Match la ap jwe kounye a</p>
                        <p className="text-[10px] text-white/40 mt-0.5">Retransmisyon an ap kòmanse...</p>
                      </div>
                    </div>
                  )}
                  {/* Broadcast overlay (GOL/Fot/Kat Jòn/etc animated
                      overlays for viewers). Rendered only on the WebRTC
                      path — the HLS BroadcastPlayer carries its own. */}
                  <BroadcastOverlay event={overlayEvent} />
                  {/* AN DIRÈK badge — TOP-RIGHT (broadcast convention; the
                      scorebug owns the top-left corner). Scaled down to match
                      the compact scorebug so the match view stays clear. */}
                  <div className="absolute top-2 right-2 md:top-3 md:right-3 z-10 flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#D92D20] shadow-md">
                    <span className="w-1 h-1 rounded-full bg-white animate-pulse" />
                    <span className="text-[8px] md:text-[9px] font-extrabold text-white uppercase tracking-wider">An Dirèk</span>
                  </div>
                  {/* Scorebug — TOP-LEFT, compact broadcast style */}
                  {bug && (
                    <div className="absolute top-2 left-2 md:top-3 md:left-3 z-10">
                      <ScoreBug
                        homeShort={bug.homeShort}
                        homeColor={bug.homeColor}
                        awayShort={bug.awayShort}
                        awayColor={bug.awayColor}
                        homeScore={bug.homeScore}
                        awayScore={bug.awayScore}
                        minute={bug.minute}
                      />
                    </div>
                  )}
                  {/* YouTube-style DVR control bar (WebRTC path) — pause /
                      ±10s / draggable timeline over the rolling buffer /
                      RETOUNEN LIVE / fullscreen. Same visual language as
                      the HLS BroadcastPlayer. Hidden during operator instant
                      replays (that sequence owns the replay <video>). */}
                  {hasVideo && !(replayState?.phase === "arming" || replayState?.phase === "normal" || replayState?.phase === "slowmo") && (
                    <WebrtcDvrBar
                      mode={replayState?.dvr?.mode ?? "live"}
                      behindSec={replayState?.dvr?.behindSec ?? 0}
                      windowSec={replayState?.dvr?.windowSec ?? 0}
                      clipPaused={replayState?.dvr?.clipPaused ?? false}
                      viewerCount={viewerCount}
                      isFullscreen={isFullscreen}
                      onTogglePlay={() => {
                        const eng = replayEngineRef.current;
                        if (!eng) return;
                        const m = replayState?.dvr?.mode ?? "live";
                        const cp = replayState?.dvr?.clipPaused ?? false;
                        // Frozen (paused-at-live or paused DVR clip) → resume;
                        // anything else playing → pause.
                        if (m === "live" || (m === "dvr" && !cp)) eng.dvrPause();
                        else eng.dvrPlay();
                      }}
                      onJump={(d) => replayEngineRef.current?.dvrJump(d)}
                      onScrub={(sec) => replayEngineRef.current?.dvrScrubTo(sec)}
                      onReturnLive={() => replayEngineRef.current?.dvrReturnLive()}
                      onToggleFullscreen={toggleFullscreen}
                    />
                  )}
                  </>
                  )}
                </>
              );
            })()}

            {/* ── STATE B: UPCOMING ── */}
            {tvState === "upcoming" && nextMatch && (() => {
              const home = teamById(nextMatch.homeTeamId);
              const away = teamById(nextMatch.awayTeamId);
              // The mobile hero is 18:9 — very short. Scale the presentation
              // down so nothing ever clips or kisses the border.
              const crestSize = isMobile ? 44 : 56;
              return (
                <div
                  className="absolute inset-0 flex flex-col"
                  style={{ backgroundImage: "url(/tv-bg.jpeg)", backgroundSize: "cover", backgroundPosition: "center" }}
                >
                  {/* Broadcast scrims — darker toward top and bottom so every
                      text row keeps consistent contrast against the photo,
                      instead of a flat blanket overlay. */}
                  <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-black/45 to-black/85" />

                  {/* TOP — competition badge (broadcast chip, not floating text) */}
                  <div className="relative z-10 flex justify-center pt-2.5 md:pt-4">
                    <div className="flex items-center gap-2 px-3 py-1 md:py-1.5 rounded-full bg-black/60 backdrop-blur-md ring-1 ring-white/15 max-w-[92%]">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#F4C400] shrink-0" />
                      <span
                        className="text-[9px] md:text-[11px] font-semibold text-white uppercase tracking-[0.18em] whitespace-nowrap overflow-hidden text-ellipsis"
                        style={{ fontFamily: "var(--font-archivo), var(--font-manrope), sans-serif" }}
                      >
                        {nextMatch.competitionName ?? competition?.name ?? "FIFAYITI"}
                      </span>
                    </div>
                  </div>

                  {/* CENTER — teams, vertically centered with flex-1 */}
                  <div className="relative z-10 flex-1 min-h-0 flex items-center justify-center px-4">
                    <div className="flex items-center gap-4 md:gap-8 lg:gap-12">
                      <div className="text-center flex flex-col items-center">
                        <TeamCrest team={home} size={crestSize} />
                        <p
                          className={cn(
                            "mt-1.5 md:mt-2.5 font-bold text-white",
                            isMobile ? "text-xs max-w-[110px] truncate" : "text-sm md:text-base"
                          )}
                          style={{ textShadow: "0 1px 6px rgba(0,0,0,0.9)" }}
                        >
                          {home?.name ?? "TBD"}
                        </p>
                      </div>

                      {/* VS — subtle broadcast divider, optically centered */}
                      <div className="flex flex-col items-center gap-1 md:gap-1.5 shrink-0">
                        <span className="h-px w-6 md:w-8 bg-white/25" />
                        <span
                          className={cn("font-black italic text-white/80", isMobile ? "text-xs" : "text-sm lg:text-base")}
                          style={{ textShadow: "0 1px 6px rgba(0,0,0,0.9)" }}
                        >
                          VS
                        </span>
                        <span className="h-px w-6 md:w-8 bg-white/25" />
                      </div>

                      <div className="text-center flex flex-col items-center">
                        <TeamCrest team={away} size={crestSize} />
                        <p
                          className={cn(
                            "mt-1.5 md:mt-2.5 font-bold text-white",
                            isMobile ? "text-xs max-w-[110px] truncate" : "text-sm md:text-base"
                          )}
                          style={{ textShadow: "0 1px 6px rgba(0,0,0,0.9)" }}
                        >
                          {away?.name ?? "TBD"}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* BOTTOM — kickoff info + countdown, with real breathing
                      room (pb-3/pb-5) so the date never touches the border. */}
                  <div className="relative z-10 px-4 pb-3 md:pb-5 flex flex-col items-center gap-2 md:gap-2.5">
                    {/* Kickoff pill */}
                    <div className="flex items-center gap-2 md:gap-3 px-3 py-1 md:py-1.5 rounded-full bg-black/60 backdrop-blur-md ring-1 ring-white/10">
                      <span className={cn("flex items-center gap-1.5 text-white/85 tnum", isMobile ? "text-[10px]" : "text-xs")}>
                        <Calendar size={isMobile ? 10 : 11} className="text-[#F4C400] shrink-0" /> {fmtDate(nextMatch.kickoff)}
                      </span>
                      <span className="w-1 h-1 rounded-full bg-white/25 shrink-0" />
                      <span className={cn("flex items-center gap-1.5 text-white/85 tnum", isMobile ? "text-[10px]" : "text-xs")}>
                        <Clock size={isMobile ? 10 : 11} className="text-[#F4C400] shrink-0" /> {fmtTime(nextMatch.kickoff)}
                      </span>
                    </div>

                    {/* Countdown */}
                    {countdown ? (
                      <div className="text-center">
                        <p className={cn("text-white/45 uppercase tracking-[0.15em] mb-0.5", isMobile ? "text-[8px]" : "text-[10px]")}>
                          Match la ap kòmanse nan
                        </p>
                        <p
                          className={cn("font-extrabold text-[#F4C400] tnum tracking-[0.08em]", isMobile ? "text-lg" : "text-2xl lg:text-3xl")}
                          style={{ textShadow: "0 1px 8px rgba(0,0,0,0.9)" }}
                        >
                          {countdown}
                        </p>
                      </div>
                    ) : (
                      <p className={cn("text-white/50", isMobile ? "text-[9px]" : "text-xs")}>Prèt pou kòmansman</p>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* ── STATE C: EMPTY ── */}
            {tvState === "empty" && (
              <div className="absolute inset-0 bg-pitch-texture-dark flex flex-col items-center justify-center p-6 text-center">
                <Tv size={32} className="text-[#F4C400] mb-2" />
                <p className="text-sm font-bold text-white">Pwochen retransmisyon an ap vini.</p>
                {lastMatch ? (
                  <div className="mt-3">
                    <p className="text-[10px] text-white/40 mb-1">Dènye match</p>
                    <div className="flex items-center gap-2 text-sm text-white">
                      <span>{teamById(lastMatch.homeTeamId)?.shortName ?? "???"}</span>
                      <span className="text-lg font-extrabold text-[#F4C400] tnum">{lastMatch.homeScore} - {lastMatch.awayScore}</span>
                      <span>{teamById(lastMatch.awayTeamId)?.shortName ?? "???"}</span>
                    </div>
                    <button onClick={() => setView("replays")}
                      className="mt-2 px-3 py-1.5 rounded bg-[#F4C400] text-[#064E2A] font-bold text-xs flex items-center gap-1 mx-auto">
                      <Play size={10} fill="#064E2A" /> Gade replay yo
                    </button>
                  </div>
                ) : (
                  <p className="text-xs text-white/40 mt-1">Ekip yo ap enskri. Tounen pita.</p>
                )}
              </div>
            )}
          </div>

          {/* ── Desktop broadcast info sidebar (lg+ only) ──
              Sits in the 340px column next to the TV stage. Renders a
              different panel depending on tvState: a live score panel
              with viewer count, an upcoming-match countdown card, or an
              "off-air" placeholder with the last result. */}
          <aside className="hidden lg:flex flex-col gap-3 self-start">
            {tvState === "live" && liveMatch && (() => {
              const home = teamById(liveMatch.homeTeamId);
              const away = teamById(liveMatch.awayTeamId);
              const homeScore = matchData?.homeScore ?? liveMatch.homeScore ?? 0;
              const awayScore = matchData?.awayScore ?? liveMatch.awayScore ?? 0;
              const clockSec = matchData?.clock ?? liveMatch.clock ?? 0;
              const half = matchData?.half ?? liveMatch.half;
              const minute = Math.floor(clockSec / 60);
              return (
                <>
                  <div className="rounded-lg border border-white/10 bg-[#064E2A]/80 backdrop-blur-sm p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#D92D20] text-[9px] font-extrabold text-white uppercase tracking-wider">
                        <span className="w-1 h-1 rounded-full bg-white animate-pulse" />
                        An Dirèk
                      </span>
                      <span className="flex items-center gap-1 text-[10px] text-white/60 tnum">
                        <Users size={11} className="text-[#F4C400]" /> {viewerCount} moun k ap gade
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex flex-col items-center gap-1.5 flex-1 min-w-0">
                        <TeamCrest team={home} size={36} />
                        <p className="text-[11px] font-bold text-white text-center truncate w-full">{home?.shortName ?? home?.name ?? "???"}</p>
                      </div>
                      <div className="flex flex-col items-center px-2">
                        <p className="text-4xl font-extrabold text-white tnum leading-none">
                          {homeScore}<span className="text-white/40 mx-1">-</span>{awayScore}
                        </p>
                        <p className="mt-1.5 text-2xl font-extrabold text-[#F4C400] tnum">{minute}'</p>
                        {half && <p className="mt-0.5 text-[9px] uppercase tracking-wider text-white/50">{half}</p>}
                      </div>
                      <div className="flex flex-col items-center gap-1.5 flex-1 min-w-0">
                        <TeamCrest team={away} size={36} />
                        <p className="text-[11px] font-bold text-white text-center truncate w-full">{away?.shortName ?? away?.name ?? "???"}</p>
                      </div>
                    </div>
                  </div>
                  {liveMatch.venue && (
                    <div className="rounded-lg border border-white/10 bg-black/40 p-3 flex items-start gap-2">
                      <MapPin size={14} className="text-[#F4C400] shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <p className="text-[9px] uppercase tracking-wider text-white/45 mb-0.5">Lyè match la</p>
                        <p className="text-xs font-semibold text-white">{liveMatch.venue}</p>
                      </div>
                    </div>
                  )}
                </>
              );
            })()}

            {tvState === "upcoming" && nextMatch && (() => {
              const home = teamById(nextMatch.homeTeamId);
              const away = teamById(nextMatch.awayTeamId);
              return (
                <div className="rounded-lg border border-white/10 bg-[#064E2A]/80 backdrop-blur-sm p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white/10 text-[9px] font-extrabold text-white uppercase tracking-wider">
                      Pwochen match
                    </span>
                    <span className="text-[10px] text-white/55 tnum flex items-center gap-1">
                      <Calendar size={11} className="text-[#F4C400]" /> {fmtDate(nextMatch.kickoff)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="flex flex-col items-center gap-1.5 flex-1 min-w-0">
                      <TeamCrest team={home} size={36} />
                      <p className="text-[11px] font-bold text-white text-center truncate w-full">{home?.shortName ?? home?.name ?? "???"}</p>
                    </div>
                    <span className="text-sm font-black italic text-white/50">VS</span>
                    <div className="flex flex-col items-center gap-1.5 flex-1 min-w-0">
                      <TeamCrest team={away} size={36} />
                      <p className="text-[11px] font-bold text-white text-center truncate w-full">{away?.shortName ?? away?.name ?? "???"}</p>
                    </div>
                  </div>
                  <div className="text-center rounded-md bg-black/30 py-2.5">
                    <p className="text-[9px] uppercase tracking-[0.15em] text-white/45 mb-0.5">Kòmansman nan</p>
                    <p className="text-2xl font-extrabold text-[#F4C400] tnum tracking-[0.08em]">{countdown ?? "-- : -- : --"}</p>
                    <p className="text-[10px] text-white/55 tnum mt-1 flex items-center justify-center gap-1">
                      <Clock size={10} className="text-[#F4C400]" /> {fmtTime(nextMatch.kickoff)}
                    </p>
                  </div>
                  {nextMatch.venue && (
                    <div className="mt-3 flex items-start gap-2 pt-3 border-t border-white/10">
                      <MapPin size={14} className="text-[#F4C400] shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <p className="text-[9px] uppercase tracking-wider text-white/45 mb-0.5">Lyè match la</p>
                        <p className="text-xs font-semibold text-white">{nextMatch.venue}</p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {tvState === "empty" && (
              <div className="rounded-lg border border-white/10 bg-[#064E2A]/80 backdrop-blur-sm p-4 flex flex-col gap-3">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="flex items-center justify-center w-7 h-7 rounded-md bg-white/10">
                      <Tv size={14} className="text-[#F4C400]" />
                    </div>
                    <p className="text-xs font-bold text-white">Pwochen retransmisyon an ap vini</p>
                  </div>
                  <p className="text-[10px] text-white/50 leading-relaxed">Ekip yo ap prepare. Tounen pita pou w gade match la an dirèk.</p>
                </div>
                {lastMatch && (
                  <div className="rounded-md bg-black/30 p-3">
                    <p className="text-[9px] uppercase tracking-wider text-white/45 mb-1.5">Dènye match</p>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        <TeamCrest team={teamById(lastMatch.homeTeamId)} size={20} />
                        <span className="text-[11px] font-bold text-white truncate">{teamById(lastMatch.homeTeamId)?.shortName ?? "???"}</span>
                      </div>
                      <span className="text-base font-extrabold text-[#F4C400] tnum">{lastMatch.homeScore} - {lastMatch.awayScore}</span>
                      <div className="flex items-center gap-1.5 min-w-0 flex-1 justify-end">
                        <span className="text-[11px] font-bold text-white truncate">{teamById(lastMatch.awayTeamId)?.shortName ?? "???"}</span>
                        <TeamCrest team={teamById(lastMatch.awayTeamId)} size={20} />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </aside>
          </div>
        </div>
      </section>

      {/* ═══ 2. MATCH KAP VINI YO (white) ═══ */}
      {upcoming.length > 0 && (
        <section className="bg-white">
          <div className="max-w-[1400px] mx-auto px-4 py-8">
            <h2 className="text-lg font-bold text-[#064E2A] mb-4">Match kap vini yo</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {upcoming.slice(0, 8).map(m => {
                const home = teamById(m.homeTeamId), away = teamById(m.awayTeamId);
                return (
                  <button key={m.id} onClick={() => { setActiveMatchId(m.id); setView("match"); }}
                    className="group text-left rounded-lg bg-[#F8F9FA] border border-[#E4E7EC] p-3 hover:border-[#F4C400] hover:shadow-md transition-all">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[9px] font-semibold text-[#667085] uppercase">{m.competitionName ?? "FIFAYITI"}</span>
                    </div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-1.5"><TeamCrest team={home} size={22} /><span className="text-xs font-bold text-[#101828]">{home?.name ?? "???"}</span></div>
                      <span className="text-sm font-bold text-[#667085] italic">vs</span>
                      <div className="flex items-center gap-1.5"><span className="text-xs font-bold text-[#101828]">{away?.name ?? "???"}</span><TeamCrest team={away} size={22} /></div>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-[#667085]">
                      <span className="flex items-center gap-0.5"><Calendar size={9} /> {fmtDate(m.kickoff)}</span>
                      <span className="flex items-center gap-0.5"><Clock size={9} /> {fmtTime(m.kickoff)}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* ═══ 3. PI BON MOMAN YO (dark green) ═══ */}
      <section className="bg-[#064E2A]">
        <div className="max-w-[1400px] mx-auto px-4 py-8">
          <div className="flex items-end justify-between mb-4">
            <h2 className="text-lg font-bold text-white">Pi bon moman yo</h2>
            <button onClick={() => setView("replays")} className="text-xs font-semibold text-[#F4C400] hover:underline flex items-center gap-1">
              Gade tout replay yo <ChevronRight size={10} />
            </button>
          </div>
          {finished.length > 0 ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {finished.slice(0, 4).map(m => {
                const home = teamById(m.homeTeamId), away = teamById(m.awayTeamId);
                return (
                  <button key={m.id} onClick={() => { setActiveMatchId(m.id); setView("match"); }}
                    className="group rounded-lg overflow-hidden bg-black/20 border border-white/10 hover:border-[#F4C400]/40 transition-all">
                    <div className="aspect-video bg-pitch-texture-dark flex items-center justify-center relative">
                      <div className="w-10 h-10 rounded-full bg-[#F4C400]/20 flex items-center justify-center group-hover:bg-[#F4C400] transition-all">
                        <Play size={16} className="text-[#F4C400] group-hover:text-[#064E2A] ml-0.5" fill="currentColor" />
                      </div>
                      <span className="absolute top-1.5 left-1.5 px-1 py-0.5 rounded text-[8px] font-bold bg-[#667085] text-white">REPLAY</span>
                    </div>
                    <div className="p-2.5">
                      <div className="flex items-center justify-between text-xs font-bold text-white">
                        <span>{home?.shortName ?? "???"}</span>
                        <span className="text-[#F4C400] tnum">{m.homeScore} - {m.awayScore}</span>
                        <span>{away?.shortName ?? "???"}</span>
                      </div>
                      <p className="text-[9px] text-white/35 mt-0.5">{fmtDate(m.kickoff)}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="rounded-lg bg-black/15 border border-white/10 p-6 text-center">
              <Star size={20} className="mx-auto text-white/15 mb-1.5" />
              <p className="text-xs text-white/35">Pi bon moman FIFAYITI yo ap parèt isit.</p>
            </div>
          )}
        </div>
      </section>

      {/* ═══ 4. KLASMAN + EKIP YO (white, merged on desktop) ═══ */}
      {teams.length > 0 && (
        <section className="bg-white">
          <div className="max-w-[1400px] mx-auto px-4 py-8">
            <div className="lg:grid lg:grid-cols-[1fr_400px] lg:gap-6">
              {/* LEFT — Standings table */}
              <div>
                <div className="flex items-end justify-between mb-4">
                  <h2 className="text-lg font-bold text-[#064E2A]">Klasman</h2>
                  <button onClick={() => setView("standings")} className="text-xs font-semibold text-[#0B6B3A] hover:underline flex items-center gap-1">
                    Gade tout klasman <ChevronRight size={10} />
                  </button>
                </div>
            <div className="rounded-lg bg-[#F8F9FA] border border-[#E4E7EC] overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="text-[9px] font-bold text-[#667085] uppercase border-b border-[#E4E7EC]">
                    <th className="py-2 px-3 text-left">#</th><th className="py-2 px-3 text-left">Ekip</th>
                    <th className="py-2 px-2 text-center">J</th><th className="py-2 px-2 text-center">G</th>
                    <th className="py-2 px-2 text-center">N</th><th className="py-2 px-2 text-center">P</th>
                    <th className="py-2 px-2 text-center">PTS</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    // Compute standings from all matches (FINI + AN_DIRÈK).
                    type Rec = { teamId: string; p: number; w: number; d: number; l: number; pts: number };
                    const map = new Map<string, Rec>();
                    for (const t of teams) map.set(t.id, { teamId: t.id, p: 0, w: 0, d: 0, l: 0, pts: 0 });
                    for (const m of [...liveMatch ? [liveMatch] : [], ...upcoming, ...finished]) {
                      if (m.status !== "FINI" && m.status !== "AN_DIRÈK") continue;
                      const h = map.get(m.homeTeamId); const a = map.get(m.awayTeamId);
                      if (!h || !a) continue;
                      h.p++; a.p++;
                      if (m.homeScore > m.awayScore) { h.w++; a.l++; h.pts += 3; }
                      else if (m.homeScore < m.awayScore) { a.w++; h.l++; a.pts += 3; }
                      else { h.d++; a.d++; h.pts++; a.pts++; }
                    }
                    const rows = [...map.values()].sort((x, y) =>
                      y.pts - x.pts || (y.w - x.w) || (y.p - x.p));
                    return rows.slice(0, 6).map((r, i) => {
                      const t = teams.find(x => x.id === r.teamId)!;
                      return (
                        <tr key={t.id} onClick={() => { setActiveTeamId(t.id); setView("team-detail"); }}
                          className="border-b border-[#E4E7EC] hover:bg-[#F0F2F5] cursor-pointer">
                          <td className="py-2.5 px-3"><span className={cn("inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold tnum", i === 0 ? "bg-[#F4C400] text-[#064E2A]" : "text-[#667085]")}>{i + 1}</span></td>
                          <td className="py-2.5 px-3"><div className="flex items-center gap-2"><TeamCrest team={t} size={18} /><span className="text-xs font-semibold text-[#101828]">{t.name}</span></div></td>
                          <td className="py-2.5 px-2 text-center text-xs text-[#667085] tnum">{r.p}</td>
                          <td className="py-2.5 px-2 text-center text-xs font-bold text-[#116B3A] tnum">{r.w}</td>
                          <td className="py-2.5 px-2 text-center text-xs text-[#667085] tnum">{r.d}</td>
                          <td className="py-2.5 px-2 text-center text-xs text-[#667085] tnum">{r.l}</td>
                          <td className="py-2.5 px-2 text-center text-base font-extrabold text-[#101828] tnum">{r.pts}</td>
                        </tr>
                      );
                    });
                  })()}
                </tbody>
              </table>
            </div>
              </div>

              {/* RIGHT — Teams grid */}
              <div className="mt-8 lg:mt-0">
                <div className="flex items-end justify-between mb-4">
                  <h2 className="text-lg font-bold text-[#064E2A]">Ekip yo</h2>
                  <button onClick={() => setView("teams")} className="text-xs font-semibold text-[#0B6B3A] hover:underline flex items-center gap-1">Tout ekip yo <ChevronRight size={10} /></button>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  {teams.slice(0, 6).map(t => (
                    <button key={t.id} onClick={() => { setActiveTeamId(t.id); setView("team-detail"); }}
                      className="group rounded-lg bg-[#F8F9FA] border border-[#E4E7EC] p-3 flex flex-col items-center gap-2 hover:border-[#F4C400] hover:shadow-md transition-all">
                      <TeamCrest team={t} size={40} />
                      <p className="text-[11px] font-bold text-[#101828] text-center">{t.name}</p>
                      <p className="text-[9px] text-[#667085]">Gwoup {t.group}</p>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ═══ 6. JWÈ YO (white) — top scorers across all teams ═══ */}
      <section className="bg-white">
        <div className="max-w-[1400px] mx-auto px-4 py-8">
          <div className="flex items-end justify-between mb-4">
            <h2 className="text-lg font-bold text-[#064E2A]">Jwè yo</h2>
            <button onClick={() => setView("players")} className="text-xs font-semibold text-[#0B6B3A] hover:underline flex items-center gap-1">
              Gade tout jwè yo <ChevronRight size={10} />
            </button>
          </div>
          {(() => {
            const all = teams.flatMap(t => (t.players ?? []).map(p => ({ ...p, team: t })));
            if (all.length === 0) {
              return (
                <div className="rounded-lg bg-[#F8F9FA] border border-[#E4E7EC] p-6 text-center">
                  <Users size={20} className="mx-auto text-[#D0D5DD] mb-1.5" />
                  <p className="text-xs text-[#667085]">Pa gen jwè enskri poko.</p>
                </div>
              );
            }
            const top = all.slice(0, 8);
            return (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {top.map(p => (
                  <button key={p.id} onClick={() => { setActiveTeamId(p.team.id); setView("team-detail"); }}
                    className="group text-left rounded-lg bg-[#F8F9FA] border border-[#E4E7EC] p-3 hover:border-[#F4C400] hover:shadow-md transition-all flex items-center gap-3">
                    {p.photoUrl ? (
                      <img src={p.photoUrl} alt={p.firstName} className="w-10 h-10 rounded-full object-cover" />
                    ) : (
                      <div className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold"
                        style={{ background: p.team.primaryColor, color: p.team.secondaryColor }}>
                        {p.firstName[0]}{p.lastName[0]}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-[#101828] truncate">{p.firstName} {p.lastName}</p>
                      <p className="text-[10px] text-[#667085]">{p.team.shortName} · #{p.jerseyNumber}</p>
                    </div>
                  </button>
                ))}
              </div>
            );
          })()}
        </div>
      </section>
    </div>
  );
}
