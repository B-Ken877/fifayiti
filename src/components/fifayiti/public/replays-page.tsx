"use client";
import { useEffect, useState } from "react";
import { useAppStore } from "@/store/app-store";
import { Play } from "lucide-react";

interface ReplayData {
  id: string;
  matchId: string;
  title: string;
  kind: string;
  minute: number;
  savedAt: string;
  thumbnail: string;
}

export function ReplaysPage() {
  const { setActiveMatchId, setView } = useAppStore();
  const [replays, setReplays] = useState<ReplayData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      // Replays are attached to matches — fetch all matches then collect replays
      try {
        const res = await fetch("/api/matches");
        const data = await res.json();
        const all: any[] = data.matches ?? [];
        const allReplays: ReplayData[] = [];
        for (const m of all) {
          for (const r of (m.replays ?? [])) {
            allReplays.push({
              id: r.id,
              matchId: m.id,
              title: r.title || `Replay · ${m.id}`,
              kind: r.kind,
              minute: r.minute,
              savedAt: r.savedAt,
              thumbnail: r.thumbnail || "",
            });
          }
        }
        setReplays(allReplays);
      } catch {}
      finally { setLoading(false); }
    })();
  }, []);

  return (
    <div className="bg-white min-h-[60vh]">
      <div className="max-w-[1280px] mx-auto px-4 lg:px-6 py-10 lg:py-14">
        <span className="eyebrow text-[#116B3A]">Archive</span>
        <h1 className="display-md text-[#101828] mt-2">Replay</h1>
        <p className="body-sm text-[#667085] mt-3 max-w-2xl">
          Tout replay sove yo se pèmanè — yo pap janm diskyetab. Chak replay lye ak match, ekip, jwè ak minit.
        </p>

        <div className="mt-5 rounded-lg border border-[#116B3A] bg-[#116B3A]/5 p-3 flex items-center gap-2">
          <span className="eyebrow text-[#116B3A]">🔒 Pèmanè</span>
          <span className="meta text-[#667085]">Pa gen bouton pou efase replay ofisyèl.</span>
        </div>

        {loading ? (
          <div className="py-12 text-center body-md text-[#667085]">Ap charger replay yo...</div>
        ) : replays.length === 0 ? (
          <div className="py-12 text-center">
            <Play size={32} className="mx-auto text-[#E4E7EC]" />
            <p className="mt-3 body-md text-[#667085]">Pa gen replay disponib poko.</p>
            <p className="meta text-[#667085] mt-1">
              Replay ap parèt isit lè operatè yo sove yo pandan match.
            </p>
          </div>
        ) : (
          <div className="mt-8 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {replays.map((r) => (
              <button
                key={r.id}
                onClick={() => {
                  setActiveMatchId(r.matchId);
                  setView("match");
                }}
                className="group text-left fifayiti-card overflow-hidden hover:border-[#116B3A] hover:shadow-md transition-all"
              >
                <div className="aspect-video relative bg-pitch-texture-dark flex items-center justify-center">
                  <Play size={32} className="text-white/70 group-hover:text-[#F4C400] group-hover:scale-110 transition-all" fill="currentColor" />
                  <div className="absolute bottom-2 right-2 bg-black/70 text-white eyebrow px-2 py-0.5 rounded">
                    {r.minute}'
                  </div>
                </div>
                <div className="p-3">
                  <p className="body-sm font-bold text-[#101828] truncate">{r.title}</p>
                  <p className="meta text-[#667085] mt-0.5">{r.kind}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
