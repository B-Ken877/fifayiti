"use client";
import { useEffect, useRef, useState } from "react";
import { Room, RoomEvent, RemoteTrack, RemoteParticipant, Track, RemoteTrackPublication } from "livekit-client";
import { BrandMark } from "@/components/fifayiti/brand-mark";
import { Radio, Wifi, WifiOff, Eye, Send, AlertCircle, ChevronRight, Camera } from "lucide-react";
import { cn } from "@/lib/utils";

const WS_URL = "wss://fifayiti.medikahaiti.site/livekit-ws";
const ROOM_NAME = "fifayiti-broadcast";

interface SlotState { active: boolean; }

export default function OperatorPage() {
  const [connected, setConnected] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const [slots, setSlots] = useState<Record<number, SlotState>>({
    1: { active: false }, 2: { active: false }, 3: { active: false },
  });
  const [viewerCount, setViewerCount] = useState(0);
  const [matches, setMatches] = useState<any[]>([]);
  const [teams, setTeams] = useState<Record<string, any>>({});
  const [activeMatchId, setActiveMatchId] = useState("");
  const [matchData, setMatchData] = useState<any>(null);
  // HLS/DVR pipeline status (auto-managed by /api/livekit-room)
  const [hlsActive, setHlsActive] = useState(false);

  const roomRef = useRef<Room | null>(null);
  const videoRefs = useRef<Record<number, HTMLVideoElement | null>>({ 1: null, 2: null, 3: null });
  const slotToParticipant = useRef<Record<number, string>>({});
  // Track pending tracks that arrived before metadata
  const pendingTracks = useRef<Record<string, RemoteTrack>>({});

  // ── Reconnect grace ──────────────────────────────────────────────
  // Camera phones on Haitian mobile data blip constantly (DTLS timeouts,
  // NAT rebinding). Each blip used to wipe the broadcast instantly
  // (selectedSlot=null) — the operator had to re-select after every
  // dropout and the TV went dark. Now: when the on-air camera drops we
  // keep the broadcast selected for GRACE ms, giving LiveKit's
  // auto-reconnect time to restore the same camera. Only after the grace
  // expires with no camera do we switch away / go dark.
  const RECONNECT_GRACE_MS = 20_000;
  const reconnectTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  // ─── Latest-state refs (LiveKit event handlers avoid stale closures) ───
  const selectedSlotRef = useRef<number | null>(null);
  const matchDataRef = useRef<any>(null);
  const activeMatchIdRef = useRef<string>("");
  const matchesRef = useRef<any[]>([]);
  const teamsRef = useRef<Record<string, any>>({});

  useEffect(() => { selectedSlotRef.current = selectedSlot; }, [selectedSlot]);

  // HLS/DVR status chip — poll the egress pipeline state
  useEffect(() => {
    const poll = async () => {
      try {
        const r = await fetch("/api/livekit-hls", { cache: "no-store" });
        if (!r.ok) return;
        const d = await r.json();
        setHlsActive(!!d.active);
      } catch {}
    };
    poll();
    const i = setInterval(poll, 10000);
    return () => clearInterval(i);
  }, []);
  useEffect(() => { matchDataRef.current = matchData; }, [matchData]);
  useEffect(() => { activeMatchIdRef.current = activeMatchId; }, [activeMatchId]);
  useEffect(() => { matchesRef.current = matches; }, [matches]);
  useEffect(() => { teamsRef.current = teams; }, [teams]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        // Fetch matches + teams
        const [mRes, tRes] = await Promise.all([
          fetch("/api/matches").then((r) => r.json()),
          fetch("/api/teams").then((r) => r.json()),
        ]);
        if (cancelled) return;
        setMatches(mRes.matches ?? []);
        const tm: Record<string, any> = {};
        for (const t of tRes.teams ?? []) tm[t.id] = t;
        setTeams(tm);

        // Get token
        const tokenRes = await fetch("/api/livekit-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roomName: ROOM_NAME, participantName: "operator", role: "operator" }),
        });
        if (!tokenRes.ok) throw new Error("token failed");
        const { token, wsUrl } = await tokenRes.json();

        const room = new Room({ adaptiveStream: true });
        roomRef.current = room;

        room.on(RoomEvent.Connected, () => {
          if (cancelled) return;
          setConnected(true);
          // Initial participant metadata — selectedSlot is appended by
          // publishOperatorState() whenever the on-air slot changes.
          room.localParticipant.setMetadata(JSON.stringify({ role: "operator" }));
        });

        // ─── Track published by a cameraman ───
        room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, pub: RemoteTrackPublication, participant: RemoteParticipant) => {
          if (cancelled || track.kind !== Track.Kind.Video) return;
          console.log(`[operator] track subscribed from ${participant.identity}, metadata: ${participant.metadata}`);
          try {
            const meta = JSON.parse(participant.metadata || "{}");
            if (meta.slot) {
              // Metadata is already set — attach immediately
              attachToSlot(meta.slot, participant.identity, track);
              maybeAutoBroadcast(meta.slot);
            } else {
              // Metadata not set yet — store the track as pending
              // We'll attach it when the metadata arrives
              pendingTracks.current[participant.identity] = track;
              console.log(`[operator] track pending for ${participant.identity} (no metadata yet)`);
            }
          } catch {}
        });

        room.on(RoomEvent.TrackUnsubscribed, (_track, _pub, participant) => {
          for (const [s, id] of Object.entries(slotToParticipant.current)) {
            if (id === participant.identity) {
              const gone = Number(s);
              setSlots((prev) => ({ ...prev, [gone]: { active: false } }));
              delete slotToParticipant.current[gone];
              // Grace period: don't wipe the broadcast yet — the camera
              // is probably auto-reconnecting. handleCameraGone fires only
              // if it doesn't come back within RECONNECT_GRACE_MS.
              scheduleCameraGone(gone);
            }
          }
          delete pendingTracks.current[participant.identity];
        });

        // ─── Metadata changed (cameraman sets slot, or operator sets selectedSlot) ───
        room.on(RoomEvent.ParticipantMetadataChanged, (identity, metadata, participant) => {
          if (cancelled || !metadata) return;
          try {
            const meta = JSON.parse(metadata);
            if (meta.slot && meta.role === "cameraman") {
              console.log(`[operator] cameraman ${identity} reports slot ${meta.slot}`);
              slotToParticipant.current[meta.slot] = identity;
              setSlots((prev) => ({ ...prev, [meta.slot]: { active: true } }));

              // If we have a pending track for this participant, attach it now
              const pendingTrack = pendingTracks.current[identity];
              if (pendingTrack) {
                attachToSlot(meta.slot, identity, pendingTrack);
                delete pendingTracks.current[identity];
                console.log(`[operator] attached pending track to slot ${meta.slot}`);
              } else {
                // The track might already be published — try to find and attach it
                for (const pub of participant.trackPublications.values()) {
                  if (pub.track && pub.track.kind === Track.Kind.Video) {
                    attachToSlot(meta.slot, identity, pub.track);
                    console.log(`[operator] attached existing track to slot ${meta.slot}`);
                    break;
                  }
                }
              }
              maybeAutoBroadcast(meta.slot);
            }
          } catch {}
        });

        room.on(RoomEvent.ParticipantConnected, () => updateViewerCount());
        room.on(RoomEvent.ParticipantDisconnected, () => updateViewerCount());

        await room.connect(wsUrl, token);
        console.log("[operator] Room connected");

        // ─── Load saved room state (selectedSlot + matchData) ───
        // This survives operator disconnect — the state is stored on the room
        try {
          const roomStateRes = await fetch("/api/livekit-room?roomName=fifayiti-broadcast");
          if (roomStateRes.ok) {
            const roomState = await roomStateRes.json();
            if (roomState.metadata) {
              if (roomState.metadata.selectedSlot !== undefined && roomState.metadata.selectedSlot !== null) {
                setSelectedSlot(roomState.metadata.selectedSlot);
              }
              if (roomState.metadata.matchData) {
                setMatchData(roomState.metadata.matchData);
                // Try to find the match ID
                if (roomState.metadata.matchData.matchId) {
                  setActiveMatchId(roomState.metadata.matchData.matchId);
                }
              }
              console.log("[operator] loaded room state:", roomState.metadata);
            }
          }
        } catch (e) {
          console.warn("[operator] could not load room state:", e);
        }

        // Process existing participants
        for (const participant of room.remoteParticipants.values()) {
          try {
            const meta = JSON.parse(participant.metadata || "{}");
            if (meta.slot && meta.role === "cameraman") {
              slotToParticipant.current[meta.slot] = participant.identity;
              setSlots((prev) => ({ ...prev, [meta.slot]: { active: true } }));
              for (const pub of participant.trackPublications.values()) {
                if (pub.track && pub.track.kind === Track.Kind.Video) {
                  attachToSlot(meta.slot, participant.identity, pub.track);
                }
                pub.setSubscribed(true);
              }
              maybeAutoBroadcast(meta.slot);
            }
          } catch {}
        }

        updateViewerCount();
      } catch (e) {
        console.error("[operator] connection error:", e);
      }
    })();

    return () => {
      cancelled = true;
      if (roomRef.current) roomRef.current.disconnect();
      // Clear any pending reconnect-grace timers
      for (const t of Object.values(reconnectTimers.current)) clearTimeout(t);
      reconnectTimers.current = {};
    };
  }, []);

  const attachToSlot = (slotNum: number, identity: string, track: RemoteTrack) => {
    slotToParticipant.current[slotNum] = identity;
    // Camera is (back) at this slot — cancel any pending wipe timer
    cancelCameraGone(slotNum);
    setSlots((prev) => ({ ...prev, [slotNum]: { active: true } }));
    const videoEl = videoRefs.current[slotNum];
    if (videoEl) {
      track.attach(videoEl);
      console.log(`[operator] attached track to slot ${slotNum}`);
    }
  };

  // ── Grace-period helpers (see RECONNECT_GRACE_MS above) ──────────
  const scheduleCameraGone = (slot: number) => {
    if (reconnectTimers.current[slot]) clearTimeout(reconnectTimers.current[slot]);
    if (selectedSlotRef.current !== slot) return; // only the on-air slot matters
    reconnectTimers.current[slot] = setTimeout(() => {
      delete reconnectTimers.current[slot];
      // Still gone? Then switch away / go dark for real.
      if (!slotToParticipant.current[slot]) handleCameraGone(slot);
    }, RECONNECT_GRACE_MS);
    console.log(`[operator] slot ${slot} lost — grace period ${RECONNECT_GRACE_MS / 1000}s before dropping broadcast`);
  };

  const cancelCameraGone = (slot: number) => {
    if (reconnectTimers.current[slot]) {
      clearTimeout(reconnectTimers.current[slot]);
      delete reconnectTimers.current[slot];
      console.log(`[operator] slot ${slot} reconnected — broadcast kept`);
    }
  };

  // ─── Build scorebug payload from a match row ───
  const buildMatchData = (m: any, tm: Record<string, any>) => ({
    matchId: m.id,
    homeShort: tm[m.homeTeamId]?.shortName ?? "HOM",
    homeColor: tm[m.homeTeamId]?.primaryColor ?? "#116B3A",
    awayShort: tm[m.awayTeamId]?.shortName ?? "AWY",
    awayColor: tm[m.awayTeamId]?.primaryColor ?? "#667085",
    homeScore: m.homeScore ?? 0,
    awayScore: m.awayScore ?? 0,
    clock: m.clock ?? 0,
    half: m.half ?? "PRE",
  });

  // ─── Auto-pick the most relevant match: live first, else next upcoming ───
  const autoPickMatch = (): { matchId: string; data: any } | null => {
    const all = matchesRef.current;
    if (all.length === 0) return null;
    const live = all.find((m) => m.status === "AN_DIRÈK");
    const upcoming = all
      .filter((m) => m.status === "PWOGRAM")
      .sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime());
    const m = live ?? upcoming[0];
    if (!m) return null;
    return { matchId: m.id, data: buildMatchData(m, teamsRef.current) };
  };

  // ─── AUTO-BROADCAST ───
  // When a camera connects and no slot is on air yet, put that camera on air
  // immediately. If no match was chosen, auto-pick one (live → next upcoming)
  // so the homepage TV flips to LIVE with a scorebug without extra clicks.
  const maybeAutoBroadcast = (slot: number) => {
    if (selectedSlotRef.current !== null) return;
    let md = matchDataRef.current;
    let mid = activeMatchIdRef.current;
    if (!md) {
      const pick = autoPickMatch();
      if (pick) { md = pick.data; mid = pick.matchId; }
    }
    selectedSlotRef.current = slot;
    setSelectedSlot(slot);
    if (md) {
      matchDataRef.current = md;
      activeMatchIdRef.current = mid;
      setMatchData(md);
      setActiveMatchId(mid);
    }
    saveRoomState(slot, md);
    publishOperatorState(slot);
    console.log(`[operator] AUTO-BROADCAST: slot ${slot} on air` + (md ? " (+ match auto-picked)" : ""));
  };

  // ─── When the on-air camera leaves: switch to another camera, else go dark ───
  const handleCameraGone = (slot: number) => {
    if (selectedSlotRef.current !== slot) return;
    const others = [1, 2, 3].filter((s) => s !== slot && slotToParticipant.current[s]);
    if (others.length > 0) {
      const ns = others[0];
      selectedSlotRef.current = ns;
      setSelectedSlot(ns);
      saveRoomState(ns, matchDataRef.current);
      publishOperatorState(ns);
      console.log(`[operator] on-air camera left → switched to slot ${ns}`);
    } else {
      selectedSlotRef.current = null;
      setSelectedSlot(null);
      saveRoomState(null, matchDataRef.current);
      publishOperatorState(null);
      console.log("[operator] on-air camera left → no cameras, broadcast off");
    }
  };

  const updateViewerCount = () => {
    const room = roomRef.current;
    if (!room) return;
    let viewers = 0;
    for (const p of room.remoteParticipants.values()) {
      try { if (JSON.parse(p.metadata || "{}").role === "viewer") viewers++; } catch {}
    }
    setViewerCount(viewers);
  };

  // ─── Save state to LiveKit ROOM metadata (survives operator disconnect) ───
  const saveRoomState = async (slot: number | null, md: any) => {
    try {
      await fetch("/api/livekit-room", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomName: "fifayiti-broadcast",
          metadata: { selectedSlot: slot, matchData: md },
        }),
      });
      console.log("[operator] room metadata saved:", { selectedSlot: slot, matchData: md });
    } catch (e) {
      console.error("[operator] failed to save room metadata:", e);
    }
  };

  // ─── Publish the selection on OUR participant metadata too ───
  // Cameramen read this to show "AN DIRÈK SOU TV" on their slot without
  // polling. (Previously the operator only wrote ROOM metadata, so the
  // cameras could never know which slot was on air.)
  const publishOperatorState = (slot: number | null) => {
    try {
      roomRef.current?.localParticipant.setMetadata(
        JSON.stringify({ role: "operator", selectedSlot: slot })
      );
    } catch {}
  };

  const selectSlot = (slot: number) => {
    selectedSlotRef.current = slot;
    setSelectedSlot(slot);
    saveRoomState(slot, matchDataRef.current);
    publishOperatorState(slot);
  };

  const selectMatch = (matchId: string) => {
    activeMatchIdRef.current = matchId;
    setActiveMatchId(matchId);
    if (!matchId) {
      matchDataRef.current = null;
      setMatchData(null);
      saveRoomState(selectedSlotRef.current, null);
      return;
    }
    const m = matchesRef.current.find((mm) => mm.id === matchId);
    if (!m) return;
    const data = buildMatchData(m, teamsRef.current);
    matchDataRef.current = data;
    setMatchData(data);
    saveRoomState(selectedSlotRef.current, data);
  };

  return (
    <div className="min-h-screen bg-[#053319] text-white flex flex-col">
      <header className="bg-[#084C2A] border-b border-fifayiti-line sticky top-0 z-30">
        <div className="max-w-[1600px] mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <a
              href="/?view=admin-dashboard"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
              style={{ minHeight: 36 }}
              aria-label="Retounen nan administrasyon"
            >
              <ChevronRight size={14} className="text-white rotate-180" />
              <span className="eyebrow text-white hidden sm:inline">Administrasyon</span>
            </a>
            <BrandMark size="sm" variant="white" />
          </div>
          <div className="flex items-center gap-3">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ background: connected ? "#116B3A" : "#D92D20" }}>
              {connected ? <Wifi size={14} /> : <WifiOff size={14} />}
              <span className="eyebrow">{connected ? "Konekte" : "Dekonekte"}</span>
            </div>
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/10">
              <Eye size={14} />
              <span className="eyebrow tnum">{viewerCount}</span>
            </div>
            <div
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg"
              style={{ background: hlsActive ? "#116B3A" : "rgba(102,112,133,0.35)" }}
              title={hlsActive ? "Anrejistreman HLS/DVR ap mache — TV gen DVR ak ~3s reta" : "Pipeline HLS/DVR pa aktif"}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-white" style={{ opacity: hlsActive ? 1 : 0.5 }} />
              <span className="eyebrow">DVR {hlsActive ? "AKTIF" : "OFF"}</span>
            </div>
            {selectedSlot !== null && (
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#F4C400] text-[#084C2A]">
                <Radio size={14} />
                <span className="eyebrow">Sou TV: Slot {selectedSlot}</span>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-[1600px] mx-auto w-full px-4 py-6">
        <div className="mb-4">
          <p className="eyebrow text-[#F4C400]">Operatè · Broadcast</p>
          <h1 className="display-md text-white mt-1">Twa kamera, yon sèl TV</h1>
        </div>

        {/* Match selector */}
        <div className="mb-4 fifayiti-card-dark p-4">
          <p className="eyebrow text-[#F4C400] mb-2">Match an dirèk</p>
          {matches.length === 0 ? (
            <p className="body-sm text-white/50">Pa gen match pwograme. Prezidan dwe kreye match yo an premye.</p>
          ) : (
            <div className="flex items-center gap-3">
              <select value={activeMatchId} onChange={(e) => selectMatch(e.target.value)}
                className="flex-1 px-3 py-2 rounded-lg bg-[#053319] border border-fifayiti-line text-white body-sm focus:outline-none focus:border-[#F4C400]" style={{ minHeight: 40 }}>
                <option value="">— Pa gen match chwazi —</option>
                {matches.map((m) => {
                  const h = teams[m.homeTeamId]; const a = teams[m.awayTeamId];
                  return <option key={m.id} value={m.id}>{h?.shortName ?? "???"} vs {a?.shortName ?? "???"} — {m.status === "AN_DIRÈK" ? "● Live" : m.status}</option>;
                })}
              </select>
              {matchData && <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#116B3A]"><span className="eyebrow text-white">Scorebug aktif</span></div>}
            </div>
          )}
        </div>

        {/* Camera grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((slot) => {
            const s = slots[slot];
            const isSelected = selectedSlot === slot;
            return (
              <div key={slot} className={cn("rounded-xl overflow-hidden border-2 transition-all bg-black", isSelected ? "border-[#F4C400] shadow-2xl" : s.active ? "border-[#116B3A]" : "border-fifayiti-line")}>
                <div className="relative aspect-video bg-black">
                  <video ref={(el) => { videoRefs.current[slot] = el; }} autoPlay muted playsInline className="w-full h-full object-cover" />
                  {!s.active && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/70">
                      <div className="text-center">
                        <Camera size={32} className={cn("mx-auto mb-2", isSelected ? "text-[#F4C400] animate-pulse" : "text-white/30")} />
                        {isSelected ? (
                          <>
                            <p className="body-sm font-bold text-[#F4C400]">Slot {slot} ap rekonekte...</p>
                            <p className="meta text-white/40 mt-1">Broadcast la rete louvri pandan 20s</p>
                          </>
                        ) : (
                          <>
                            <p className="body-sm font-bold text-white/60">Slot {slot}</p>
                            <p className="meta text-white/40 mt-1">Kameraman pa konekte</p>
                          </>
                        )}
                        {!isSelected && <p className="meta text-white/40 mt-1">URL: <code className="text-[#F4C400]">/operator/camera/{slot}</code></p>}
                      </div>
                    </div>
                  )}
                  <div className="absolute top-2 left-2 flex items-center gap-2 px-2.5 py-1 rounded-md bg-black/70 backdrop-blur-md">
                    <span className="eyebrow text-white">Slot {slot}</span>
                    {s.active && <span className="inline-flex items-center gap-1 eyebrow text-[#116B3A]"><span className="w-1.5 h-1.5 rounded-full bg-[#116B3A] animate-pulse" />LIVE</span>}
                  </div>
                  {s.active && (
                    <div className="absolute bottom-2 inset-x-2 flex items-center justify-end gap-2">
                      <button onClick={() => selectSlot(slot)} className={cn("inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md eyebrow font-bold transition-all", isSelected ? "bg-[#F4C400] text-[#084C2A]" : "bg-white/10 text-white hover:bg-[#F4C400] hover:text-[#084C2A]")}>
                        {isSelected ? <><Send size={12} /> SOU TV</> : <><ChevronRight size={12} /> VOYE SOU TV</>}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
