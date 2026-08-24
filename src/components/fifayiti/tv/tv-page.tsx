"use client";
import { useEffect, useRef, useState } from "react";
import { Room, RoomEvent, RemoteTrack, RemoteParticipant, Track } from "livekit-client";
import { Radio, Maximize, Calendar, MapPin, ChevronRight, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { ScoreBug } from "@/components/fifayiti/scorebug";

const WS_URL = "wss://fifayiti.medikahaiti.site/livekit-ws";
const ROOM_NAME = "fifayiti-broadcast";

interface MatchData { homeShort: string; homeColor: string; awayShort: string; awayColor: string; homeScore: number; awayScore: number; clock: number; half: string; }

const EVENT_ICONS: Record<string, { icon: string; color: string }> = {
  GOL: { icon: "⚽", color: "#F4C400" }, KAT_JON: { icon: "🟨", color: "#F4C400" },
  KAT_WOUJ: { icon: "🟥", color: "#D92D20" }, RANPLASMAN: { icon: "🔄", color: "#667085" },
  KOMANSE: { icon: "▶", color: "#116B3A" }, MWATYE_TAN: { icon: "⏸", color: "#F4C400" },
  DEZYEM_MITAN: { icon: "▶", color: "#116B3A" }, FEN_MATCH: { icon: "■", color: "#D92D20" },
};
const EVENT_LABELS: Record<string, string> = {
  GOL: "Gòl", KAT_JON: "Kat jòn", KAT_WOUJ: "Kat wouj", RANPLASMAN: "Ranplasman",
  KOMANSE: "Kòmanse match", MWATYE_TAN: "Mwatye tan", DEZYEM_MITAN: "Dezyèm mitan", FEN_MATCH: "Fen match",
};

export function TvPage() {
  const [connected, setConnected] = useState(false);
  const [hasVideo, setHasVideo] = useState(false);
  const [matchData, setMatchData] = useState<MatchData | null>(null);
  const [viewerCount, setViewerCount] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [goalFlash, setGoalFlash] = useState(false);
  const [events, setEvents] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<"apersi" | "koment" | "evnman" | "estatistik" | "ekip">("apersi");
  const [matchInfo, setMatchInfo] = useState<any>(null);
  const [nextMatch, setNextMatch] = useState<any>(null);
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);

  const roomRef = useRef<Room | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const currentTrackRef = useRef<RemoteTrack | null>(null);
  const prevScoreRef = useRef<{ home: number; away: number }>({ home: -1, away: -1 });
  const selectedSlotRef = useRef<number | null>(null);
  useEffect(() => { selectedSlotRef.current = selectedSlot; }, [selectedSlot]);

  useEffect(() => {
    (async () => {
      try {
        const mRes = await fetch("/api/matches").then(r => r.json());
        const all = mRes.matches ?? [];
        const live = all.find((m: any) => m.status === "AN_DIRÈK");
        if (live) { setMatchInfo(live); const eRes = await fetch(`/api/matches/${live.id}`).then(r => r.json()); if (eRes.match?.events) setEvents(eRes.match.events); }
        const next = all.filter((m: any) => m.status === "PWOGRAM").sort((a: any,b: any) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime())[0];
        if (next) setNextMatch(next);
      } catch {}
    })();
  }, []);

  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch("/api/livekit-room?roomName=fifayiti-broadcast", { cache: "no-store" });
        if (!res.ok) return; const data = await res.json();
        const meta = data.metadata ?? null;
        const slot = meta?.selectedSlot ?? null;
        setSelectedSlot(slot);
        if (slot === null) {
          // Broadcast is off — clear stale scorebug/score-panel data so the
          // page can never show "An Dirèk" with no video.
          setMatchData(null);
          return;
        }
        const m = meta.matchData;
        if (m && prevScoreRef.current.home >= 0) { if (m.homeScore !== prevScoreRef.current.home || m.awayScore !== prevScoreRef.current.away) { setGoalFlash(true); setTimeout(() => setGoalFlash(false), 2000); } }
        if (m) prevScoreRef.current = { home: m.homeScore, away: m.awayScore };
        setMatchData(m ?? null);
      } catch {}
    };
    poll(); const i = setInterval(poll, 2000); return () => clearInterval(i);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const tokenRes = await fetch("/api/livekit-token", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ roomName: ROOM_NAME, participantName: `viewer-${Date.now()}`, role: "viewer" }) });
        if (!tokenRes.ok) return; const { token, wsUrl } = await tokenRes.json();
        const room = new Room({ adaptiveStream: true, autoSubscribe: true });
        roomRef.current = room;
        room.on(RoomEvent.Connected, () => { if (!cancelled) { setConnected(true); room.localParticipant.setMetadata(JSON.stringify({ role: "viewer" })); }});
        room.on(RoomEvent.TrackSubscribed, (track, _pub, participant) => { if (cancelled || track.kind !== Track.Kind.Video) return; try { const meta = JSON.parse(participant.metadata || "{}"); if (meta.slot && meta.slot === selectedSlotRef.current) attachTrack(track); } catch {} });
        room.on(RoomEvent.ParticipantMetadataChanged, (_id, metadata, participant) => { if (!metadata) return; try { const meta = JSON.parse(metadata); if (meta.slot && meta.role === "cameraman") scanForSelected(); } catch {} });
        room.on(RoomEvent.TrackUnsubscribed, (track) => { if (currentTrackRef.current === track) { currentTrackRef.current = null; setHasVideo(false); scanForSelected(); } });
        room.on(RoomEvent.ParticipantConnected, () => updateViewerCount());
        room.on(RoomEvent.ParticipantDisconnected, () => updateViewerCount());
        await room.connect(wsUrl, token);
        scanForSelected();
        updateViewerCount();
      } catch (e) { console.error("[tv] error:", e); }
    })();
    return () => { cancelled = true; if (roomRef.current) roomRef.current.disconnect(); };
  }, []);

  // Hot-switch: operator changed camera → re-attach from the new slot.
  // When the broadcast goes OFF (slot null), detach the video and hide it
  // so a still-connected camera can never keep playing after the operator
  // stopped the retransmission.
  useEffect(() => {
    if (selectedSlot === null) {
      if (currentTrackRef.current && videoRef.current) {
        try { currentTrackRef.current.detach(videoRef.current); } catch {}
      }
      currentTrackRef.current = null;
      setHasVideo(false);
      return;
    }
    scanForSelected();
  }, [selectedSlot]);

  const attachTrack = (track: RemoteTrack) => {
    if (currentTrackRef.current && videoRef.current) currentTrackRef.current.detach(videoRef.current);
    currentTrackRef.current = track;
    if (videoRef.current) { track.attach(videoRef.current); setHasVideo(true); }
  };

  // Attach ONLY the operator-selected camera's video (polls room metadata)
  const scanForSelected = () => {
    const room = roomRef.current;
    if (!room) return;
    for (const p of room.remoteParticipants.values()) {
      try {
        const meta = JSON.parse(p.metadata || "{}");
        if (meta.slot && meta.slot === selectedSlotRef.current) {
          for (const pub of p.trackPublications.values()) {
            if (!pub.isSubscribed) pub.setSubscribed(true);
            if (pub.track && pub.track.kind === Track.Kind.Video) { attachTrack(pub.track); return; }
          }
        }
      } catch {}
    }
  };
  const updateViewerCount = () => { const room = roomRef.current; if (!room) return; let v = 0; for (const p of room.remoteParticipants.values()) { try { if (JSON.parse(p.metadata||"{}").role === "viewer") v++; } catch {} } setViewerCount(v); };

  // Safety net: if a track was stored before the <video> element was mounted,
  // attach it as soon as the element becomes available in the DOM.
  useEffect(() => {
    if (!hasVideo && videoRef.current && currentTrackRef.current) {
      try { currentTrackRef.current.attach(videoRef.current); setHasVideo(true); } catch {}
    }
  });
  const toggleFullscreen = async () => { if (!document.fullscreenElement) { try { await containerRef.current?.requestFullscreen?.(); const o = (screen as any).orientation; if (o?.lock) try { await o.lock('landscape'); } catch {} setIsFullscreen(true); } catch {} } else { try { await document.exitFullscreen?.(); const o = (screen as any).orientation; if (o?.unlock) try { await o.unlock(); } catch {} setIsFullscreen(false); } catch {} } };
  useEffect(() => { const f = () => setIsFullscreen(!!document.fullscreenElement); document.addEventListener("fullscreenchange", f); return () => document.removeEventListener("fullscreenchange", f); }, []);

  const halfLabel = matchData?.half === "1" ? "1yè mitan" : matchData?.half === "2" ? "2yèm mitan" : matchData?.half === "HT" ? "Mwatye tan" : "";
  const fmtMD = (iso: string) => { try { const d = new Date(iso); return d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" }) + " · " + d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }); } catch { return ""; } };
  const sortedEvents = [...events].sort((a, b) => (a.half - b.half) || (a.minute - b.minute));

  return (
    <div className="bg-[#064E2A] min-h-screen">
      {/* ═══ VIDEO ═══ */}
      <div className="max-w-[1280px] mx-auto px-4 pt-4">
        <div ref={containerRef} className={cn("relative aspect-video rounded-lg overflow-hidden bg-black border border-white/10", isFullscreen && "rounded-none border-none aspect-auto h-screen w-screen")}>
          {/* The <video> element is ALWAYS mounted (hidden with CSS until frames
              arrive) so LiveKit can attach the selected camera track to it.
              Previously it was conditionally rendered only when hasVideo was
              true — but hasVideo could only become true after attaching to
              this element, which never existed. Deadlock: video never showed. */}
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="w-full h-full object-cover"
            style={{ display: hasVideo ? "block" : "none" }}
          />
          {!hasVideo && (
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <Radio size={28} className="text-[#F4C400] mb-2" />
              <p className="text-sm font-bold text-white">{connected ? "Tann kamera..." : "Pa gen match an dirèk"}</p>
              <p className="text-xs text-white/40 mt-0.5">{selectedSlot !== null ? "Retransmisyon an ap kòmanse..." : "Operatè a poko kòmanse retransmisyon an."}</p>
            </div>
          )}
          {hasVideo && (
            <>
              {/* Scorebug — TOP-LEFT, compact broadcast style.
                  Clock is in SECONDS in matchData — convert to minutes. */}
              {matchData && (
                <div className="absolute top-2 left-2 md:top-3 md:left-3 z-10">
                  <ScoreBug
                    homeShort={matchData.homeShort}
                    homeColor={matchData.homeColor}
                    awayShort={matchData.awayShort}
                    awayColor={matchData.awayColor}
                    homeScore={matchData.homeScore}
                    awayScore={matchData.awayScore}
                    minute={Math.floor((matchData.clock ?? 0) / 60)}
                    goalFlash={goalFlash}
                  />
                </div>
              )}
              <div className="absolute top-2 right-2 md:top-3 md:right-3 z-10 flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#D92D20] shadow-md"><span className="w-1 h-1 rounded-full bg-white animate-pulse" /><span className="text-[8px] md:text-[9px] font-extrabold text-white uppercase tracking-wider">Live</span></div>
              {goalFlash && <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10"><div className="px-3 py-1 rounded bg-[#F4C400] animate-pulse"><span className="text-xs font-extrabold text-[#064E2A]">⚽ Goal!</span></div></div>}
              <div className="absolute bottom-2 right-2 z-10 flex items-center gap-1"><div className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-black/70"><span className="text-[8px] text-white/50">Views</span><span className="text-[8px] font-bold text-white tnum">{viewerCount}</span></div><button onClick={toggleFullscreen} className="flex items-center justify-center w-5 h-5 rounded bg-black/70 hover:bg-black/90"><Maximize size={10} className="text-white" /></button></div>
            </>
          )}
        </div>
      </div>

      {/* ═══ SCORE PANEL ═══ */}
      {/* Only while a broadcast is actually on air (selectedSlot set) — a
          stale matchData with no broadcast must not render an "An Dirèk"
          panel with no video. */}
      {matchData && selectedSlot !== null && (
        <div className="max-w-[1280px] mx-auto px-4 mt-3">
          <div className="flex items-center justify-center gap-4 py-3 px-4 rounded-lg bg-white/5 border border-white/10">
            <div className="text-center flex-1"><p className="text-sm font-bold text-white">{matchData.homeShort.toUpperCase()}</p></div>
            <div className="flex items-center gap-3"><span className="text-3xl font-extrabold text-white tnum">{matchData.homeScore}</span><span className="text-3xl font-extrabold text-white/20">-</span><span className="text-3xl font-extrabold text-white tnum">{matchData.awayScore}</span></div>
            <div className="text-center flex-1"><p className="text-sm font-bold text-white">{matchData.awayShort.toUpperCase()}</p></div>
          </div>
          <div className="flex items-center justify-center gap-2 mt-1.5">
            <span className="text-[10px] font-bold text-[#F4C400] tnum">{Math.floor((matchData.clock ?? 0) / 60)}&prime;</span>
            {halfLabel && <span className="text-[10px] text-white/40">· {halfLabel}</span>}
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#D92D20]"><span className="w-1 h-1 rounded-full bg-white animate-pulse" /><span className="text-[8px] font-bold text-white uppercase">An Dirèk</span></span>
          </div>
        </div>
      )}

      {/* ═══ NAV ═══ */}
      <div className="max-w-[1280px] mx-auto px-4 mt-4 sticky top-0 bg-[#064E2A] z-20 py-2 border-b border-white/10">
        <div className="flex items-center gap-1 overflow-x-auto">
          {([["apersi","Apèsi"],["koment","Kòmantè"],["evnman","Evènman"],["estatistik","Estatistik"],["ekip","Ekip"]] as const).map(([key, label]) => (
            <button key={key} onClick={() => setActiveTab(key)} className={cn("px-3 py-1.5 text-xs font-semibold whitespace-nowrap border-b-2 transition-colors", activeTab === key ? "border-[#F4C400] text-[#F4C400]" : "border-transparent text-white/40 hover:text-white/70")}>{label}</button>
          ))}
        </div>
      </div>

      {/* ═══ TAB CONTENT ═══ */}
      <div className="max-w-[1280px] mx-auto px-4 py-4 pb-12">
        {activeTab === "apersi" && (
          <div className="space-y-4">
            <div>
              <h3 className="text-xs font-bold text-white/50 uppercase mb-2">Kòmantè an dirèk</h3>
              {sortedEvents.length > 0 ? (<div className="space-y-1.5">{sortedEvents.slice(-5).reverse().map(ev => { const info = EVENT_ICONS[ev.kind] ?? { icon: "•", color: "#667085" }; return (<div key={ev.id} className="flex items-start gap-2 py-1.5 border-b border-white/5"><span className="text-[10px] font-bold text-[#F4C400] tnum shrink-0 mt-0.5 w-8">{ev.minute}'</span><span className="text-xs shrink-0" style={{ color: info.color }}>{info.icon}</span><span className="text-xs text-white/70 flex-1">{ev.description}</span></div>); })}</div>) : (<p className="text-xs text-white/30 py-3">Kòmantè ap parèt la a pandan match la.</p>)}
            </div>
            {matchInfo && (<div><h3 className="text-xs font-bold text-white/50 uppercase mb-2">Detay match la</h3><div className="rounded-lg bg-white/5 border border-white/10 p-3 space-y-1.5">{matchInfo.venue && <div className="flex items-center gap-2 text-xs text-white/60"><MapPin size={11} className="text-[#F4C400]" /><span className="text-white/40">Teren:</span><span className="font-semibold text-white">{matchInfo.venue}</span></div>}{matchInfo.kickoff && <div className="flex items-center gap-2 text-xs text-white/60"><Calendar size={11} className="text-[#F4C400]" /><span className="text-white/40">Dat:</span><span className="font-semibold text-white">{fmtMD(matchInfo.kickoff)}</span></div>}{matchInfo.referee && <div className="flex items-center gap-2 text-xs text-white/60"><Users size={11} className="text-[#F4C400]" /><span className="text-white/40">Abit:</span><span className="font-semibold text-white">{matchInfo.referee}</span></div>}</div></div>)}
            {nextMatch && (<div><h3 className="text-xs font-bold text-white/50 uppercase mb-2">Pwochen match</h3><button onClick={() => window.location.reload()} className="w-full text-left rounded-lg bg-white/5 border border-white/10 p-3 hover:border-[#F4C400]/40 transition-all"><p className="text-[10px] text-white/40 mb-1">{fmtMD(nextMatch.kickoff)}</p><div className="flex items-center justify-between text-sm font-bold text-white"><span>{nextMatch.homeTeamId?.slice(0,8) ?? "TBD"}</span><span className="text-white/30 text-xs">vs</span><span>{nextMatch.awayTeamId?.slice(0,8) ?? "TBD"}</span></div></button></div>)}
          </div>
        )}
        {activeTab === "koment" && (
          <div><h3 className="text-xs font-bold text-white/50 uppercase mb-3">Kòmantè an dirèk</h3>{sortedEvents.length > 0 ? (<div className="space-y-1">{[...sortedEvents].reverse().map(ev => { const info = EVENT_ICONS[ev.kind] ?? { icon: "•", color: "#667085" }; return (<div key={ev.id} className="flex items-start gap-2 py-2 border-b border-white/5"><span className="text-[10px] font-bold text-[#F4C400] tnum shrink-0 mt-0.5 w-8">{ev.minute}'</span><span className="text-xs shrink-0 mt-0.5" style={{ color: info.color }}>{info.icon}</span><span className="text-xs text-white/70 flex-1">{ev.description}</span></div>); })}</div>) : (<p className="text-xs text-white/30 py-4">Kòmantè ap parèt la a pandan match la.</p>)}</div>
        )}
        {activeTab === "evnman" && (
          <div><h3 className="text-xs font-bold text-white/50 uppercase mb-3">Evènman match la</h3>{sortedEvents.length > 0 ? (<div className="relative"><div className="absolute left-4 top-0 bottom-0 w-px bg-white/10" /><div className="space-y-3">{sortedEvents.map(ev => { const info = EVENT_ICONS[ev.kind] ?? { icon: "•", color: "#667085" }; const isHalf = ev.kind === "MWATYE_TAN" || ev.kind === "KOMANSE" || ev.kind === "DEZYEM_MITAN"; if (isHalf) return (<div key={ev.id} className="relative pl-10 py-1"><span className="absolute left-0 w-8 h-8 rounded-full bg-[#064E2A] border border-[#F4C400] flex items-center justify-center text-[10px] font-bold text-[#F4C400]">{ev.minute}'</span><p className="text-xs font-bold text-[#F4C400] uppercase tracking-wider mt-1.5">{EVENT_LABELS[ev.kind] ?? ev.kind}</p></div>); return (<div key={ev.id} className="relative pl-10 py-1"><span className="absolute left-0 w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-xs" style={{ color: info.color }}>{info.icon}</span><div className="flex items-start gap-2 mt-1"><span className="text-[10px] font-bold text-[#F4C400] tnum">{ev.minute}'</span><div className="flex-1"><p className="text-xs font-bold text-white">{EVENT_LABELS[ev.kind] ?? ev.kind}</p><p className="text-[11px] text-white/50">{ev.description}</p></div></div></div>); })}</div></div>) : (<p className="text-xs text-white/30 py-4">Okenn evènman anrejistre pou match sa a poko.</p>)}</div>
        )}
        {activeTab === "estatistik" && (
          <div><h3 className="text-xs font-bold text-white/50 uppercase mb-3">Estatistik</h3><div className="rounded-lg bg-white/5 border border-white/10 p-4 text-center"><p className="text-xs text-white/30">Estatistik detaye ap disponib lè sistèm match la anrejistre done yo.</p></div></div>
        )}
        {activeTab === "ekip" && (
          <div><h3 className="text-xs font-bold text-white/50 uppercase mb-3">Ekip yo</h3>{matchData ? (<div className="grid grid-cols-2 gap-3"><div className="rounded-lg bg-white/5 border border-white/10 p-3 text-center"><div className="w-12 h-12 rounded-md bg-[#0B6B3A] flex items-center justify-center mx-auto mb-2 text-sm font-black text-white">{matchData.homeShort.slice(0,3).toUpperCase()}</div><p className="text-xs font-bold text-white">{matchData.homeShort.toUpperCase()}</p><p className="text-[10px] text-white/40 mt-1">Starting XI ap parèt...</p></div><div className="rounded-lg bg-white/5 border border-white/10 p-3 text-center"><div className="w-12 h-12 rounded-md bg-[#667085] flex items-center justify-center mx-auto mb-2 text-sm font-black text-white">{matchData.awayShort.slice(0,3).toUpperCase()}</div><p className="text-xs font-bold text-white">{matchData.awayShort.toUpperCase()}</p><p className="text-[10px] text-white/40 mt-1">Starting XI ap parèt...</p></div></div>) : (<p className="text-xs text-white/30 py-4">Ekip yo ap parèt lè operatè a chwazi match la.</p>)}</div>
        )}
      </div>
    </div>
  );
}
