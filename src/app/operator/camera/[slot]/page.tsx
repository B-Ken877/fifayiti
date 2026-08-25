"use client";
import { useRef, useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Room, RoomEvent, Track, createLocalTracks, VideoPresets } from "livekit-client";
import { BrandMark } from "@/components/fifayiti/brand-mark";
import { Camera, CameraOff, Radio, Wifi, WifiOff, Users, Eye, AlertCircle, LogOut, UserCircle, Copy, Check, Monitor, Smartphone, ChevronDown, ChevronRight } from "lucide-react";

export default function CameraPage() {
  const params = useParams<{ slot: string }>();
  const slot = Number(params?.slot);

  const videoRef = useRef<HTMLVideoElement>(null);
  const roomRef = useRef<Room | null>(null);
  const wakeLockRef = useRef<any>(null);

  const [status, setStatus] = useState<"idle" | "requesting" | "live" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [step, setStep] = useState("");
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [viewerCount, setViewerCount] = useState(0);
  const [operatorOnline, setOperatorOnline] = useState(false);
  const [connected, setConnected] = useState(false);
  const [cameramanRole, setCameramanRole] = useState<string>("");

  // OBS WHIP integration state
  const [obsPanelOpen, setObsPanelOpen] = useState(false);
  const [whipUrl, setWhipUrl] = useState<string>("");
  const [whipToken, setWhipToken] = useState<string>("");
  const [tokenLoading, setTokenLoading] = useState(false);

  // Streamlabs RTMP integration state
  const [slPanelOpen, setSlPanelOpen] = useState(false);
  const [slName, setSlName] = useState<string>("");
  const [rtmpUrl, setRtmpUrl] = useState<string>("");
  const [rtmpKey, setRtmpKey] = useState<string>("");
  const [rtmpLoading, setRtmpLoading] = useState(false);

  const [copiedField, setCopiedField] = useState<string | null>(null);

  // ── Quality selector ─────────────────────────────────────
  // User feedback (2026-08-24 field test): WebRTC is far more fluid than
  // RTMP on Haitian mobile networks — so the BROWSER broadcast is the
  // primary path, and the bitrate must fit mobile upload capacity.
  //   fluid (default) — 720p @ 3 Mbps: holds up on Natcom/Digicel data
  //   hd              — 1080p @ 6 Mbps: for Wi-Fi / fiber only
  const [quality, setQuality] = useState<"fluid" | "hd">("fluid");
  // Background-tab hazard: on phones, when this page goes to background
  // (user switches app/tab), Android freezes WebRTC publishing — the
  // participant stays "connected" but NO video frames reach viewers
  // (verified 2026-08-24: this recorded black on TV while "LIVE").
  const [backgrounded, setBackgrounded] = useState(false);
  const QUALITY = quality === "hd"
    ? { w: 1920, h: 1080, bitrate: 6_000_000, label: "1080p HD" }
    : { w: 1280, h: 720, bitrate: 3_000_000, label: "720p Fluit" };



  // Pull the trusted role from /api/auth/me so we can greet the
  // cameraman by their account name (cameraman1 / cameraman2 / cameraman3
  // / cameraman — legacy). This is display only; the middleware
  // already enforced slot binding before this page loaded.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/auth/me", { cache: "no-store" });
        const d = await r.json();
        if (!cancelled && d?.authed && d?.role) setCameramanRole(d.role);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const onVis = () => setBackgrounded(document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  const logout = async () => {
    try { await fetch("/api/auth/logout", { method: "POST" }); } catch {}
    window.location.href = "/";
  };

  // ───────────────────────────────────────────────────────────────────
  // OBS WHIP integration — fetch a URL + stream key for OBS Studio
  // ───────────────────────────────────────────────────────────────────
  // Click "Jwenn lyen OBS" → calls /api/livekit-whip-token → displays
  // a WHIP URL + stream key the cameraman pastes into OBS Studio →
  // Settings → Stream → Service: WHIP.
  //
  // Why this matters: OBS encodes video with x264/nvenc (CPU/GPU) instead
  // of the browser's WebRTC encoder (which is tuned for video calls).
  // Result: ~3× better quality at the same bitrate, and the cameraman
  // can use real HDMI capture cards / camcorders instead of a phone cam.
  // ───────────────────────────────────────────────────────────────────
  const fetchWhipToken = async () => {
    setTokenLoading(true);
    try {
      const r = await fetch("/api/livekit-whip-token", { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error || "Pa ka jwenn token OBS");
      setWhipUrl(d.whipUrl);
      setWhipToken(d.token);
      setObsPanelOpen(true);
    } catch (e: any) {
      setErrorMsg(`OBS: ${e.message}`);
    } finally {
      setTokenLoading(false);
    }
  };

  // ───────────────────────────────────────────────────────────────────
  // Streamlabs RTMP integration — fetch URL + stream key for the
  // Streamlabs mobile app (Custom RTMP destination).
  //
  // Streamlabs bonds Wi-Fi + cellular ("Network Boost") and
  // auto-reconnects — the most reliable option for stadium conditions
  // on Haitian mobile data.
  // ───────────────────────────────────────────────────────────────────
  const fetchRtmpInfo = async () => {
    setRtmpLoading(true);
    try {
      const r = await fetch("/api/livekit-rtmp-token", { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error || "Pa ka jwenn enfòmasyon Streamlabs");
      setSlName(d.name);
      setRtmpUrl(d.rtmpUrl);
      setRtmpKey(d.streamKey);
      setSlPanelOpen(true);
    } catch (e: any) {
      setErrorMsg(`Streamlabs: ${e.message}`);
    } finally {
      setRtmpLoading(false);
    }
  };

  const copyToClipboard = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      // Fallback for older browsers
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); setCopiedField(field); setTimeout(() => setCopiedField(null), 2000); } catch {}
      document.body.removeChild(ta);
    }
  };

  if (![1, 2, 3].includes(slot)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#053319] p-4 text-white">
        <div className="text-center">
          <AlertCircle size={40} className="mx-auto mb-3 text-[#F4C400]" />
          <p className="heading-md">Slot valab: 1, 2, oswa 3</p>
        </div>
      </div>
    );
  }

  const startBroadcast = async () => {
    setStatus("requesting");
    setErrorMsg("");
    setStep("1/5: Mande aksè kamè...");
    try {
      // ── HD + fluid retransmission upgrade ───────────────────────────
      // 1080p capture. The Room publishDefaults below enable simulcast
      // (3 spatial layers) so the TV client picks the best layer its
      // bandwidth can handle.
      const localTracks = await createLocalTracks({
        video: {
          resolution: { width: QUALITY.w, height: QUALITY.h, frameRate: 30 },
          facingMode: "environment",
        },
        audio: false,
      });
      console.log("[camera] tracks created:", localTracks.length);

      // Attach preview
      const videoTrack = localTracks.find((t) => t.kind === Track.Kind.Video);
      if (videoTrack && videoRef.current) {
        videoTrack.attach(videoRef.current);
      }

      // ─── Wake lock: prevent the phone screen from turning off ───
      try {
        if ("wakeLock" in navigator) {
          const wakeLock = await (navigator as any).wakeLock.request("screen");
          wakeLockRef.current = wakeLock;
          console.log("[camera] wake lock acquired");
          document.addEventListener("visibilitychange", async () => {
            if (document.visibilityState === "visible" && wakeLockRef.current === null) {
              try {
                wakeLockRef.current = await (navigator as any).wakeLock.request("screen");
                console.log("[camera] wake lock re-acquired");
              } catch {}
            }
          });
        }
      } catch (e) {
        console.warn("[camera] wake lock not available:", e);
      }

      // 2. Get token (response includes TURN servers for CGNAT cameramen)
      setStep("2/5: Konekte ak sèv LiveKit...");
      const tokenRes = await fetch("/api/livekit-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomName: "fifayiti-broadcast", participantName: `camera-${slot}`, role: "cameraman" }),
      });
      if (!tokenRes.ok) throw new Error("Pa ka jwenn token");
      const { token, wsUrl, turnServers } = await tokenRes.json();
      console.log("[camera] token received");

      // 3. Connect to room
      setStep("3/5: Konekte ak chanm...");
      const room = new Room({
        dynacast: true,
        // ── HD publish defaults ──
        // • videoCodec: "h264" — better hardware acceleration than VP8
        // • videoEncoding: 6 Mbps — the broadcast floor for 1080p30
        //   sports H.264 (was ~1.5 Mbps default). If the cameraman's
        //   upload can't push it, LiveKit's congestion control backs off.
        // • simulcast: true + videoSimulcastLayers — publishes
        //   1080p/540p/360p. The TV client picks the best layer its
        //   download bandwidth can handle. This is THE fix for the
        //   "blurry / choppy" problem.
        //   NOTE: the SDK field is videoEncoding (maxBitrate) — an
        //   earlier revision used a non-existent `videoBitRate` key that
        //   was silently ignored, leaving the bitrate at default.
        publishDefaults: {
          videoCodec: "h264",
          videoEncoding: { maxBitrate: QUALITY.bitrate, maxFramerate: 30 },
          simulcast: true,
          videoSimulcastLayers: [VideoPresets.h540, VideoPresets.h360],
        },
      });
      roomRef.current = room;

      room.on(RoomEvent.ParticipantConnected, () => updateStats());
      room.on(RoomEvent.ParticipantDisconnected, () => updateStats());
      room.on(RoomEvent.ParticipantMetadataChanged, () => updateStats());
      room.on(RoomEvent.Connected, () => { setConnected(true); });

      // TURN relay for cameramen behind carrier-grade NAT (Natcom /
      // Digicel mobile data): pass the time-limited credentials from
      // /api/livekit-token as the RTCPeerConnection iceServers.
      await room.connect(wsUrl, token, {
        rtcConfig: {
          iceServers:
            Array.isArray(turnServers) && turnServers.length
              ? turnServers
              : [{ urls: "stun:stun.l.google.com:19302" }],
        },
      });
      console.log("[camera] room connected");

      // 4. Publish tracks
      setStep("4/5: Pibliye videyo a...");
      try {
        await room.localParticipant.publishTracks(localTracks);
        console.log("[camera] tracks published (simulcast on)");
      } catch (pubErr) {
        console.warn("[camera] publishTracks failed, trying setCameraEnabled:", pubErr);
        await room.localParticipant.setCameraEnabled(true, {
          resolution: { width: QUALITY.w, height: QUALITY.h, frameRate: 30 },
          facingMode: "environment",
        });
        console.log("[camera] camera enabled via setCameraEnabled");
      }

      // 5. Set metadata
      setStep("5/5: Finalize...");
      try {
        await room.localParticipant.setMetadata(JSON.stringify({ slot, role: "cameraman" }));
      } catch (metaErr) {
        console.warn("[camera] setMetadata failed (non-fatal):", metaErr);
      }

      setStep("");
      setStatus("live");
      updateStats();
    } catch (e: any) {
      console.error("[camera] error:", e);
      setStatus("error");
      setStep("");
      setErrorMsg(
        e.name === "NotAllowedError" ? "Ou refize aksè kamè a. Pèmèt kamè nan paramèt navigatè ou."
        : e.name === "NotFoundError" ? "Pa gen kamè twouve sou aparèy sa a."
        : e.name === "NotReadableError" ? "Yon lòt aplikasyon ap itilize kamè a."
        : e.name === "OverconstrainedError" ? "Kamè a pa sipòte rezolisyon sa a."
        : `${e.name}: ${e.message ?? "Erè enkonni"}`
      );
      if (roomRef.current) {
        try { roomRef.current.disconnect(); } catch {}
        roomRef.current = null;
      }
    }
  };

  const updateStats = () => {
    const room = roomRef.current;
    if (!room) return;
    const participants = Array.from(room.remoteParticipants.values());
    const viewers = participants.filter((p) => { try { return JSON.parse(p.metadata || "{}").role === "viewer"; } catch { return false; } });
    const operators = participants.filter((p) => { try { return JSON.parse(p.metadata || "{}").role === "operator"; } catch { return false; } });
    setViewerCount(viewers.length);
    setOperatorOnline(operators.length > 0);
    for (const op of operators) {
      try { if (JSON.parse(op.metadata || "{}").selectedSlot === slot) { setIsBroadcasting(true); return; } } catch {}
    }
    setIsBroadcasting(false);
  };

  const stopBroadcast = () => {
    if (wakeLockRef.current) { try { wakeLockRef.current.release(); } catch {} wakeLockRef.current = null; }
    if (roomRef.current) { roomRef.current.disconnect(); roomRef.current = null; }
    setConnected(false); setStatus("idle"); setIsBroadcasting(false);
  };

  useEffect(() => {
    return () => {
      if (wakeLockRef.current) { try { wakeLockRef.current.release(); } catch {} }
      if (roomRef.current) roomRef.current.disconnect();
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#053319] text-white flex flex-col">
      <header className="bg-[#084C2A] border-b border-fifayiti-line">
        <div className="max-w-[1280px] mx-auto px-4 py-3 flex items-center justify-between">
          <BrandMark size="sm" variant="white" />
          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/10">
              <UserCircle size={14} className="text-[#F4C400]" />
              <span className="eyebrow text-white">{cameramanRole || "cameraman"}@fifayiti.com</span>
            </div>
            <span className="eyebrow text-[#F4C400]">Slot {slot}</span>
            <button
              onClick={logout}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
              style={{ minHeight: 36 }}
              aria-label="Dekonekte"
            >
              <LogOut size={14} className="text-white" />
              <span className="eyebrow text-white hidden md:inline">Dekonekte</span>
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-[1280px] mx-auto w-full px-4 py-6">
        <div className="grid lg:grid-cols-[1.4fr_1fr] gap-6">
          <div className="space-y-4">
            {backgrounded && status === "live" && (
              <div className="rounded-lg p-3 border flex items-start gap-2 animate-pulse" style={{ background: "rgba(217,45,32,0.15)", borderColor: "#D92D20" }}>
                <AlertCircle size={16} className="text-[#D92D20] shrink-0 mt-0.5" />
                <p className="body-sm text-white">
                  <strong>Paj sa a an background!</strong> Android ap bloke kamera a — moun ki ap gade TV yo pa wè anyen. Tanpri <strong>louvri paj sa a ankò</strong> epi kenbe li devan pandan tout match la.
                </p>
              </div>
            )}
            <div className="relative aspect-video rounded-xl overflow-hidden bg-black border border-fifayiti-line">
              <video ref={videoRef} muted playsInline autoPlay className="w-full h-full object-cover" />
              {status !== "live" && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                  <div className="text-center">
                    <Camera size={48} className="mx-auto text-white/40 mb-3" />
                    <p className="body-md text-white/70">
                      {status === "requesting" ? (step || "Ap mande aksè kamè...") : status === "error" ? "Erè aksè kamè" : "Kamè fèmen"}
                    </p>
                  </div>
                </div>
              )}
              {status === "live" && (
                <>
                  <div className="absolute top-3 left-3 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-black/70 backdrop-blur-md">
                    <span className={`w-2 h-2 rounded-full ${isBroadcasting ? "bg-[#D92D20] animate-pulse" : "bg-[#F4C400]"}`} />
                    <span className="eyebrow text-white">{isBroadcasting ? "● AN DIRÈK SOU TV" : "AP TRANSMET"}</span>
                  </div>
                  <div className="absolute top-3 right-3 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-black/70 backdrop-blur-md">
                    <span className="eyebrow text-[#F4C400]">{quality === "hd" ? "HD" : "FLUIT"}</span>
                    <span className="eyebrow text-white/40">·</span>
                    <span className="eyebrow text-white/60">{quality === "hd" ? "1080p" : "720p"}</span>
                    <span className="eyebrow text-white/40">·</span>
                    <span className="eyebrow text-white/60">{quality === "hd" ? "6" : "3"}Mbps</span>
                    <Eye size={12} className="text-white/70 ml-2" />
                    <span className="eyebrow text-white tnum">{viewerCount}</span>
                  </div>
                </>
              )}
            </div>

            {status !== "live" ? (
              <>
              {/* Quality selector — fluid-first. 720p/3Mbps holds up on
                  Haitian mobile data; 1080p/6Mbps is for Wi-Fi/fiber. */}
              <div className="flex gap-2">
                <button
                  onClick={() => setQuality("fluid")}
                  className={quality === "fluid"
                    ? "flex-1 rounded-xl px-3 py-2 font-bold transition-all border-2"
                    : "flex-1 rounded-xl px-3 py-2 font-bold transition-all border-2 border-fifayiti-line bg-black/20 text-white/60 hover:text-white"}
                  style={quality === "fluid" ? { background: "#F4C400", color: "#053319", borderColor: "#F4C400", minHeight: 48 } : { minHeight: 48 }}
                  aria-pressed={quality === "fluid"}
                >
                  <span className="eyebrow block">720p · FLUIT</span>
                  <span className="text-[10px] opacity-70">Rekòmande — done mobil</span>
                </button>
                <button
                  onClick={() => setQuality("hd")}
                  className={quality === "hd"
                    ? "flex-1 rounded-xl px-3 py-2 font-bold transition-all border-2"
                    : "flex-1 rounded-xl px-3 py-2 font-bold transition-all border-2 border-fifayiti-line bg-black/20 text-white/60 hover:text-white"}
                  style={quality === "hd" ? { background: "#F4C400", color: "#053319", borderColor: "#F4C400", minHeight: 48 } : { minHeight: 48 }}
                  aria-pressed={quality === "hd"}
                >
                  <span className="eyebrow block">1080p · HD</span>
                  <span className="text-[10px] opacity-70">Sèlman Wi-Fi / fib</span>
                </button>
              </div>
              <button onClick={startBroadcast} disabled={status === "requesting"} className="w-full btn-featured" style={{ minHeight: 56 }}>
                <Camera size={18} />
                {status === "requesting" ? (step || "Ap mande aksè...") : `Kòmanse retransmisyon (${QUALITY.label} · WebRTC)`}
              </button>
              </>
            ) : (
              <button onClick={stopBroadcast} className="w-full rounded-xl font-bold transition-all hover:brightness-110" style={{ background: "#D92D20", color: "#FFFFFF", minHeight: 56 }}>
                <CameraOff size={18} className="inline mr-2" /> Kanpe retransmisyon
              </button>
            )}

            {errorMsg && (
              <div className="rounded-lg p-3 border flex items-start gap-2" style={{ background: "rgba(217,45,32,0.10)", borderColor: "#D92D20" }}>
                <AlertCircle size={16} className="text-[#D92D20] shrink-0 mt-0.5" />
                <p className="body-sm text-white">{errorMsg}</p>
              </div>
            )}

            {/* ── Streamlabs RTMP integration panel ─────────────────────── */}
            {/* Streamlabs mobile app (Custom RTMP): bonds Wi-Fi + cellular,
                auto-reconnects, real hardware encoder — the most reliable
                camera option for Haitian stadium conditions. */}
            <div className="fifayiti-card-dark p-4">
              <button
                onClick={() => setSlPanelOpen(!slPanelOpen)}
                className="w-full flex items-center justify-between text-left"
                aria-expanded={slPanelOpen}
              >
                <div className="flex items-center gap-2">
                  <Smartphone size={16} className="text-[#F4C400]" />
                  <span className="eyebrow text-[#F4C400]">POU STREAMLABS (telefòn — sekou sèlman)</span>
                </div>
                {slPanelOpen ? <ChevronDown size={16} className="text-white/60" /> : <ChevronRight size={16} className="text-white/60" />}
              </button>

              {slPanelOpen && (
                <div className="mt-4 space-y-4">
                  <div className="rounded-lg p-3 border border-[#D92D20]/40 bg-[#D92D20]/10">
                    <p className="body-sm text-white/80 leading-relaxed">
                      <strong className="text-[#D92D20]">⚠ ATANSYON — GWO RETA:</strong> Streamlabs apoloji RTMP. Sèvè a dwe transkode li anvan li rive sou TV — sa kreye <strong>3–10 segond reta</strong> e li ka grandi si rezo a fèb.
                    </p>
                    <p className="body-sm text-white/70 mt-2 leading-relaxed">
                      Pou reta ki pi piti (~1 segond), sèvi ak bouton <strong>“Kòmanse retransmisyon”</strong> ki anlè a — se WebRTC menm jan ak yon apèl videyo, e li te pi fluid nan tès ou yo.
                    </p>
                  </div>
                  <p className="body-sm text-white/80 leading-relaxed">
                    Sèvi ak <strong>Streamlabs</strong> sèlman kòm <strong>sekou</strong> — si navigatè a pa ka difize sou telefòn nan (kamè bloke, telefòn twò vye). Avantaj li: li konbine Wi-Fi ak done selilè ansanm (Network Boost) e li rekonèkte otomatik lè rezo a tonbe.
                  </p>

                  {/* Step 1 — get credentials */}
                  <div className="space-y-1">
                    <p className="eyebrow text-white/60">ETA 1 — Jwenn enfòmasyon ou yo</p>
                    {!rtmpUrl ? (
                      <button
                        onClick={fetchRtmpInfo}
                        disabled={rtmpLoading}
                        className="w-full rounded-lg px-4 py-2 bg-[#F4C400] text-[#053319] font-bold transition-colors hover:brightness-110 disabled:opacity-50"
                        style={{ minHeight: 40 }}
                      >
                        {rtmpLoading ? "Ap jwenn enfòmasyon..." : "Jwenn enfòmasyon Streamlabs mwen an"}
                      </button>
                    ) : (
                      <div className="space-y-2">
                        {/* Name field */}
                        <div>
                          <label className="eyebrow text-white/60 mb-1 block">Non (Name)</label>
                          <div className="flex gap-2">
                            <input
                              readOnly
                              value={slName}
                              className="flex-1 rounded-lg bg-black/40 border border-fifayiti-line px-3 py-2 text-white text-sm font-mono"
                            />
                            <button
                              onClick={() => copyToClipboard(slName, "sl-name")}
                              className="px-3 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
                              aria-label="Kopye non"
                            >
                              {copiedField === "sl-name" ? <Check size={16} className="text-[#116B3A]" /> : <Copy size={16} className="text-white" />}
                            </button>
                          </div>
                        </div>
                        {/* URL field */}
                        <div>
                          <label className="eyebrow text-white/60 mb-1 block">URL</label>
                          <div className="flex gap-2">
                            <input
                              readOnly
                              value={rtmpUrl}
                              className="flex-1 rounded-lg bg-black/40 border border-fifayiti-line px-3 py-2 text-white text-sm font-mono"
                            />
                            <button
                              onClick={() => copyToClipboard(rtmpUrl, "sl-url")}
                              className="px-3 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
                              aria-label="Kopye URL"
                            >
                              {copiedField === "sl-url" ? <Check size={16} className="text-[#116B3A]" /> : <Copy size={16} className="text-white" />}
                            </button>
                          </div>
                        </div>
                        {/* Stream key field */}
                        <div>
                          <label className="eyebrow text-white/60 mb-1 block">Kle (Stream Key)</label>
                          <div className="flex gap-2">
                            <input
                              readOnly
                              value={rtmpKey}
                              className="flex-1 rounded-lg bg-black/40 border border-fifayiti-line px-3 py-2 text-white text-xs font-mono"
                            />
                            <button
                              onClick={() => copyToClipboard(rtmpKey, "sl-key")}
                              className="px-3 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
                              aria-label="Kopye kle"
                            >
                              {copiedField === "sl-key" ? <Check size={16} className="text-[#116B3A]" /> : <Copy size={16} className="text-white" />}
                            </button>
                          </div>
                        </div>
                        <button
                          onClick={fetchRtmpInfo}
                          className="text-xs text-[#F4C400] hover:underline"
                        >
                          ↻ Refwèchi ( kle a menm pou tout match )
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Step 2 — configure Streamlabs */}
                  <div className="space-y-1">
                    <p className="eyebrow text-white/60">ETA 2 — Konfigure Streamlabs</p>
                    <ol className="body-sm text-white/80 space-y-1.5 ml-5 list-decimal">
                      <li>Ouvri Streamlabs → ale nan <strong>Settings</strong> (ikon roue)</li>
                      <li>Chwazi <strong>Platforms</strong> → <strong>Custom RTMP</strong> (oswa <strong>RTMP Custom</strong>)</li>
                      <li>Tape <strong>Name</strong>, <strong>URL</strong> ak <strong>Stream Key</strong> ki gen la a (itilize bouton kopye a)</li>
                      <li>Nan <strong>Settings → Video</strong>:
                        <ul className="ml-5 mt-1 list-disc text-white/70">
                          <li>Rezolisyon: <strong>720p</strong> (1080p sèlman si ou sou Wi-Fi/fib solid)</li>
                          <li>Bitrate: <strong>2500–3000 Kbps</strong> sou done mobil (Natcom/Digicel). 4500–6000 sèlman sou Wi-Fi/fib.
                            <br /><span className="text-white/50">⚠ Bitrate twò wo pou rezo a = reta k ap grandi san aret (buffering). Meye pi ba pase twò wo.</span></li>
                        </ul>
                      </li>
                      <li>Klike <strong>Go Live</strong> anvan match la kòmanse. Videyo a ap parèt sou FIFAYITI TV — operatè a chwazi kamera ou menm jan toujou.</li>
                    </ol>
                  </div>

                  <div className="rounded-lg p-3 border border-[#F4C400]/30 bg-[#F4C400]/5 space-y-2">
                    <p className="body-sm text-white/80">
                      <strong className="text-[#F4C400]">Enpòtan:</strong> Pa kòmanse Streamlabs ak paj kamera navigatè a (oswa OBS) an menm tan. Yon sèl kamera pa slot. Si paj kamera a ap pibliye, klike <strong>Kanpe retransmisyon</strong> anvan ou klike Go Live nan Streamlabs.
                    </p>
                    <p className="body-sm text-white/60">
                      Note: RTMP gen 3–8 segond reta — se nòmal. Si reta a kòmanse grandi san aret, bese bitrate a nan Streamlabs (Settings → Video). Si Network Boost mande abònman Ultra, ou ka difize san li tou.
                    </p>
                  </div>
                </div>
              )}

              {!slPanelOpen && (
                <p className="body-sm text-white/60 mt-2">
                  Klike pou wè konfigirasyon Streamlabs ak enfòmasyon ou.
                </p>
              )}
            </div>

            {/* ── OBS WHIP integration panel ───────────────────────────── */}
            {/* Lets the cameraman switch from browser-publish to OBS Studio
                broadcasting (1080p60, real encoder, HDMI capture cards). */}
            <div className="fifayiti-card-dark p-4">
              <button
                onClick={() => setObsPanelOpen(!obsPanelOpen)}
                className="w-full flex items-center justify-between text-left"
                aria-expanded={obsPanelOpen}
              >
                <div className="flex items-center gap-2">
                  <Monitor size={16} className="text-[#F4C400]" />
                  <span className="eyebrow text-[#F4C400]">POU OBS STUDIO (òdinatè — WHIP, ti reta)</span>
                </div>
                {obsPanelOpen ? <ChevronDown size={16} className="text-white/60" /> : <ChevronRight size={16} className="text-white/60" />}
              </button>

              {obsPanelOpen && (
                <div className="mt-4 space-y-4">
                  <p className="body-sm text-white/80 leading-relaxed">
                    Pou pi bon kalite videyo sou yon <strong>òdinatè</strong> (1080p, 60 fps, sans HDMI nan yon vrè kamè), itilize <strong>OBS Studio</strong>. OBS gen yon ansèyman pi fò pase navigatè a epi li sipòte kat captire.
                  </p>

                  {/* Step 1 — download OBS */}
                  <div className="space-y-1">
                    <p className="eyebrow text-white/60">ETA 1 — Telechaje OBS Studio</p>
                    <a
                      href="https://obsproject.com/download"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-[#F4C400] body-sm hover:underline"
                    >
                      obsproject.com/download
                    </a>
                  </div>

                  {/* Step 2 — get WHIP URL + token */}
                  <div className="space-y-1">
                    <p className="eyebrow text-white/60">ETA 2 — Jwenn lyen ou a</p>
                    {!whipUrl ? (
                      <button
                        onClick={fetchWhipToken}
                        disabled={tokenLoading}
                        className="w-full rounded-lg px-4 py-2 bg-[#F4C400] text-[#053319] font-bold transition-colors hover:brightness-110 disabled:opacity-50"
                        style={{ minHeight: 40 }}
                      >
                        {tokenLoading ? "Ap jwenn lyen..." : "Jwenn lyen OBS mwen an"}
                      </button>
                    ) : (
                      <div className="space-y-2">
                        {/* WHIP URL field */}
                        <div>
                          <label className="eyebrow text-white/60 mb-1 block">Server URL (OBS → Stream → Server)</label>
                          <div className="flex gap-2">
                            <input
                              readOnly
                              value={whipUrl}
                              className="flex-1 rounded-lg bg-black/40 border border-fifayiti-line px-3 py-2 text-white text-sm font-mono"
                            />
                            <button
                              onClick={() => copyToClipboard(whipUrl, "url")}
                              className="px-3 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
                              aria-label="Kopye URL"
                            >
                              {copiedField === "url" ? <Check size={16} className="text-[#116B3A]" /> : <Copy size={16} className="text-white" />}
                            </button>
                          </div>
                        </div>
                        {/* Token field */}
                        <div>
                          <label className="eyebrow text-white/60 mb-1 block">Bearer Token (OBS → Stream → Stream Key)</label>
                          <div className="flex gap-2">
                            <input
                              readOnly
                              value={whipToken}
                              className="flex-1 rounded-lg bg-black/40 border border-fifayiti-line px-3 py-2 text-white text-xs font-mono"
                            />
                            <button
                              onClick={() => copyToClipboard(whipToken, "token")}
                              className="px-3 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
                              aria-label="Kopye token"
                            >
                              {copiedField === "token" ? <Check size={16} className="text-[#116B3A]" /> : <Copy size={16} className="text-white" />}
                            </button>
                          </div>
                        </div>
                        <button
                          onClick={fetchWhipToken}
                          className="text-xs text-[#F4C400] hover:underline"
                        >
                          ↻ Refwèchi lyen an ( kle a menm pou tout match )
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Step 3 — configure OBS */}
                  <div className="space-y-1">
                    <p className="eyebrow text-white/60">ETA 3 — Konfigure OBS</p>
                    <ol className="body-sm text-white/80 space-y-1.5 ml-5 list-decimal">
                      <li>Louvri OBS Studio → <strong>Settings</strong> → <strong>Stream</strong></li>
                      <li><strong>Service:</strong> WHIP</li>
                      <li><strong>Server:</strong> kole URL ou jwenn nan etap 2</li>
                      <li><strong>Stream Key / Bearer Token:</strong> kole token ou jwenn nan etap 2</li>
                      <li>Pou pi bon kalite — <strong>Settings → Output</strong>:
                        <ul className="ml-5 mt-1 list-disc text-white/70">
                          <li>Encoder: <strong>NVIDIA NVENC H.264</strong> (si gen GPU Nvidia) oswa <strong>x264</strong></li>
                          <li>Rate control: <strong>CBR</strong></li>
                          <li>Bitrate: <strong>6000 Kbps</strong></li>
                          <li>Keyframe interval: <strong>2 s</strong></li>
                        </ul>
                      </li>
                      <li><strong>Settings → Video</strong>:
                        <ul className="ml-5 mt-1 list-disc text-white/70">
                          <li>Base resolution: <strong>1920x1080</strong></li>
                          <li>FPS: <strong>60</strong> (o 30 si entènèt la piti)</li>
                        </ul>
                      </li>
                      <li>Klike <strong>Start Streaming</strong> nan OBS. Videyo a ap parèt sou TV FIFAYITI.</li>
                    </ol>
                  </div>

                  <div className="rounded-lg p-3 border border-[#F4C400]/30 bg-[#F4C400]/5">
                    <p className="body-sm text-white/80">
                      <strong className="text-[#F4C400]">Enpòtan:</strong> Pa lance OBS ak navigatè a (oswa Streamlabs) an menm tan. Sèlman youn nan yo dwe konekte kòm <code className="text-white">camera-{slot}</code>. Si yon lòt kamera ap pibliye, kanpe li anvan ou klike Start Streaming.
                    </p>
                  </div>
                </div>
              )}

              {!obsPanelOpen && (
                <p className="body-sm text-white/60 mt-2">
                  Klike pou wè konfigirasyon OBS ak lyen ou.
                </p>
              )}
            </div>
          </div>

          <aside className="space-y-4">
            <div className="fifayiti-card-dark p-4">
              <p className="eyebrow text-[#F4C400] mb-3">Estati</p>
              <div className="space-y-2">
                <StatusRow icon={connected ? Wifi : WifiOff} label={connected ? "WebRTC konekte" : "Dekonekte"} tone={connected ? "green" : "gray"} />
                <StatusRow icon={Radio} label={isBroadcasting ? "Sou FIFAYITI TV" : "Pa sou TV"} tone={isBroadcasting ? "red" : "gray"} />
                <StatusRow icon={Users} label={operatorOnline ? "Operatè konekte" : "Operatè pa la"} tone={operatorOnline ? "green" : "gray"} />
                <StatusRow icon={Eye} label={`${viewerCount} moun ap gade`} tone={viewerCount > 0 ? "green" : "gray"} />
              </div>
            </div>

            <div className="fifayiti-card-dark p-4">
              <p className="eyebrow text-[#F4C400] mb-3">Konfigirasyon HD</p>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between text-white/80"><span>Rezolisyon</span><span className="text-white font-mono">{quality === "hd" ? "1920×1080" : "1280×720"}</span></div>
                <div className="flex justify-between text-white/80"><span>Bitrate</span><span className="text-white font-mono">{quality === "hd" ? "6" : "3"} Mbps</span></div>
                <div className="flex justify-between text-white/80"><span>Kòdèk</span><span className="text-white font-mono">H.264</span></div>
                <div className="flex justify-between text-white/80"><span>Simulcast</span><span className="text-[#116B3A] font-mono">AKTIVE</span></div>
                <div className="flex justify-between text-white/80"><span>TURN (relè CGNAT)</span><span className="text-[#116B3A] font-mono">AKTIVE</span></div>
              </div>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}

function StatusRow({ icon: Icon, label, tone }: { icon: React.ElementType; label: string; tone: "green" | "red" | "gray" }) {
  const color = tone === "green" ? "#116B3A" : tone === "red" ? "#D92D20" : "#667085";
  return (
    <div className="flex items-center justify-between rounded-lg border border-fifayiti-line px-3 py-2 bg-black/20">
      <span className="inline-flex items-center gap-2 body-sm text-white"><Icon size={14} style={{ color }} />{label}</span>
      <span className="w-2 h-2 rounded-full" style={{ background: color }} />
    </div>
  );
}
