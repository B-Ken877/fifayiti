"use client";
import { useRef, useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Room, RoomEvent, Track, createLocalTracks } from "livekit-client";
import { BrandMark } from "@/components/fifayiti/brand-mark";
import { Camera, CameraOff, Radio, Wifi, WifiOff, Users, Eye, AlertCircle, LogOut, UserCircle } from "lucide-react";

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

  const logout = async () => {
    try { await fetch("/api/auth/logout", { method: "POST" }); } catch {}
    window.location.href = "/";
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
      // 1. Get camera permission + create tracks
      const localTracks = await createLocalTracks({
        video: { resolution: { width: 1280, height: 720 }, facingMode: "environment" },
        audio: false,
      });
      console.log("[camera] tracks created:", localTracks.length);

      // Attach preview
      const videoTrack = localTracks.find((t) => t.kind === Track.Kind.Video);
      if (videoTrack && videoRef.current) {
        videoTrack.attach(videoRef.current);
      }

      // ─── Wake lock: prevent the phone screen from turning off ───
      // This keeps the browser tab alive while broadcasting.
      // Without it, the phone OS kills the tab after ~1 min of inactivity,
      // which disconnects the cameraman from LiveKit.
      try {
        if ("wakeLock" in navigator) {
          const wakeLock = await (navigator as any).wakeLock.request("screen");
          wakeLockRef.current = wakeLock;
          console.log("[camera] wake lock acquired");
          // Re-acquire on visibility change (wake lock is released when tab is hidden)
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

      // 2. Get token
      setStep("2/5: Konekte ak sèv LiveKit...");
      const tokenRes = await fetch("/api/livekit-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomName: "fifayiti-broadcast", participantName: `camera-${slot}`, role: "cameraman" }),
      });
      if (!tokenRes.ok) throw new Error("Pa ka jwenn token");
      const { token, wsUrl } = await tokenRes.json();
      console.log("[camera] token received");

      // 3. Connect to room
      setStep("3/5: Konekte ak chanm...");
      const room = new Room({
        adaptiveStrategy: "adaptiveStreaming",
        dynacast: true,
        publishDefaults: { videoCodec: "h264", videoBitRate: 1_500_000 },
      });
      roomRef.current = room;

      room.on(RoomEvent.ParticipantConnected, () => updateStats());
      room.on(RoomEvent.ParticipantDisconnected, () => updateStats());
      // The operator publishes { role: "operator", selectedSlot } on its own
      // participant metadata whenever the on-air slot changes — re-check our
      // "AN DIRÈK SOU TV" indicator when that happens.
      room.on(RoomEvent.ParticipantMetadataChanged, () => updateStats());
      room.on(RoomEvent.Connected, () => { setConnected(true); });

      await room.connect(wsUrl, token);
      console.log("[camera] room connected");

      // 4. Publish tracks
      setStep("4/5: Pibliye videyo a...");
      try {
        await room.localParticipant.publishTracks(localTracks);
        console.log("[camera] tracks published");
      } catch (pubErr) {
        console.warn("[camera] publishTracks failed, trying setCameraEnabled:", pubErr);
        // Fallback: use setCameraEnabled
        await room.localParticipant.setCameraEnabled(true, {
          resolution: { width: 1280, height: 720 },
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
      // Disconnect room if connected
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
                    <span className="eyebrow text-white/60">FPS:</span>
                    <span className="eyebrow text-white tnum">30</span>
                    <Eye size={12} className="text-white/70 ml-2" />
                    <span className="eyebrow text-white tnum">{viewerCount}</span>
                  </div>
                </>
              )}
            </div>

            {status !== "live" ? (
              <button onClick={startBroadcast} disabled={status === "requesting"} className="w-full btn-featured" style={{ minHeight: 56 }}>
                <Camera size={18} />
                {status === "requesting" ? (step || "Ap mande aksè...") : "Kòmanse retransmisyon"}
              </button>
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
