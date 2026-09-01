"use client";

// FIFAYITI PARIAJ — Betting Operator dashboard.
// Staff-only page for curating the sequence of betting markets.

import { useEffect, useState, useCallback } from "react";
import { useAppStore } from "@/store/app-store";
import {
  ArrowLeft, Flame, Loader2, Play, Pause, X, AlertTriangle,
  Check, Clock, Users, TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatHtg } from "@/lib/betting/types";

interface Template { id: string; code: string; label: string; selectionMode: string; settleOnEvent: string }
interface Match { id: string; homeShort: string; awayShort: string; status: string; homeScore: number; awayScore: number; clock: number }
interface ActiveMarket {
  active: boolean;
  market: {
    id: string;
    question: string;
    status: string;
    templateCode: string;
    selections: { id: string; key: string; label: string }[];
    liquidity: { selectionId: string; stakeCentimes: string; openOrderCount: number }[];
    match: Match;
  } | null;
}

export function BettingOperatorPage() {
  const { setView } = useAppStore();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [active, setActive] = useState<ActiveMarket | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [selectedMatch, setSelectedMatch] = useState<string | null>(null);
  const [config, setConfig] = useState<any>({});
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error" | "info"; msg: string } | null>(null);

  const showToast = (type: "success" | "error" | "info", msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 4000);
  };

  const load = useCallback(async () => {
    try {
      const [tRes, mRes, aRes] = await Promise.all([
        fetch("/api/betting/templates", { cache: "no-store" }),
        fetch("/api/matches", { cache: "no-store" }),
        fetch("/api/betting/markets/active", { cache: "no-store" }),
      ]);
      if (tRes.ok) { const d = await tRes.json(); setTemplates(d.templates ?? []); }
      if (mRes.ok) {
        const d = await mRes.json();
        const ms = (d.matches ?? []).filter((m: any) => m.status === "AN_DIRÈK" || m.status === "PWOGRAM").map((m: any) => ({
          id: m.id,
          homeShort: m.homeTeamId?.slice(0, 4) ?? "???",
          awayShort: m.awayTeamId?.slice(0, 4) ?? "???",
          status: m.status,
          homeScore: m.homeScore,
          awayScore: m.awayScore,
          clock: m.clock,
        }));
        setMatches(ms);
        if (ms[0] && !selectedMatch) setSelectedMatch(ms[0].id);
      }
      if (aRes.ok) setActive(await aRes.json());
    } catch {}
  }, [selectedMatch]);

  useEffect(() => { load(); const i = setInterval(load, 3000); return () => clearInterval(i); }, [load]);

  const createMarket = async () => {
    if (!selectedMatch || !selectedTemplate) return;
    setLoading(true);
    try {
      const res = await fetch("/api/betting/markets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId: selectedMatch, templateCode: selectedTemplate, config }),
      });
      const data = await res.json();
      if (!res.ok) { showToast("error", data.error ?? "Erè"); }
      else { showToast("success", "Mache kreye. Klike 'Pibliye' pou louvri li."); load(); }
    } finally { setLoading(false); }
  };

  const publishMarket = async (id: string) => {
    const res = await fetch(`/api/betting/markets/${id}/publish`, { method: "POST" });
    if (res.ok) { showToast("success", "Mache louvri pou pariyaj!"); load(); }
    else { const d = await res.json(); showToast("error", d.error ?? "Erè"); }
  };

  const suspendMarket = async (id: string) => {
    const res = await fetch(`/api/betting/markets/${id}/suspend`, { method: "POST" });
    if (res.ok) { showToast("info", "Mache sispann."); load(); }
  };

  const closeMarket = async (id: string) => {
    const res = await fetch(`/api/betting/markets/${id}/close`, { method: "POST" });
    if (res.ok) { showToast("info", "Mache fèmen."); load(); }
  };

  const cancelMarket = async (id: string) => {
    if (!confirm("Anile mache sa a? Tout pariyaj yo ap ranbouse.")) return;
    const res = await fetch(`/api/betting/markets/${id}/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "Operatè anile" }),
    });
    if (res.ok) { showToast("info", "Mache anile, lajan ranbouse."); load(); }
  };

  const emergencySuspend = async () => {
    if (!confirm("SISPANN TOUT? Sa a ap sispann tout mache ki louvri.")) return;
    const res = await fetch("/api/betting/operator/emergency-suspend", { method: "POST" });
    if (res.ok) { showToast("info", "Tout mache sispann."); load(); }
  };

  const activeMarket = active?.market;
  const liveMatch = matches.find((m) => m.status === "AN_DIRÈK");

  return (
    <div className="min-h-screen bg-[#064E2A] pb-12">
      {/* ═══ HEADER ═══ */}
      <div className="sticky top-0 z-30 bg-[#064E2A]/95 backdrop-blur-md border-b border-white/10">
        <div className="max-w-[1400px] mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button onClick={() => setView("home")} className="p-1.5 -ml-1.5 rounded-lg hover:bg-white/10 transition">
              <ArrowLeft size={18} className="text-white" />
            </button>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-md bg-[#F4C400] flex items-center justify-center">
                <Flame size={15} className="text-[#064E2A]" />
              </div>
              <h1 className="text-sm font-extrabold text-white">Operatè Pariaj</h1>
            </div>
          </div>
          <button
            onClick={emergencySuspend}
            className="px-3 py-1.5 rounded-lg bg-[#D92D20] text-white text-xs font-bold flex items-center gap-1.5 hover:brightness-110 transition"
          >
            <AlertTriangle size={12} /> SISPANN TOUT
          </button>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto px-4 pt-4 grid lg:grid-cols-[1fr_400px] gap-5">
        {/* ═══ LEFT: Active market + match ═══ */}
        <div className="space-y-4">
          {/* Live match */}
          {liveMatch && (
            <div className="rounded-xl bg-gradient-to-br from-[#0B6B3A] to-[#064E2A] border border-white/10 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold text-[#D92D20] uppercase tracking-wider">● An Dirèk</span>
                <span className="text-xs text-white/60 tnum">{Math.floor(liveMatch.clock / 60)}'{String(liveMatch.clock % 60).padStart(2, "0")}</span>
              </div>
              <div className="flex items-center justify-between text-white">
                <span className="text-lg font-bold">{liveMatch.homeShort}</span>
                <span className="text-2xl font-black tnum">{liveMatch.homeScore} - {liveMatch.awayScore}</span>
                <span className="text-lg font-bold">{liveMatch.awayShort}</span>
              </div>
            </div>
          )}

          {/* Active market panel */}
          {activeMarket ? (
            <div className="rounded-xl bg-white shadow-lg overflow-hidden">
              <div className="px-4 py-3 bg-gradient-to-r from-[#F4C400] to-[#E0B000]">
                <span className="text-[10px] font-extrabold text-[#064E2A] uppercase tracking-wider">Mache Aktif</span>
                <h2 className="text-base font-extrabold text-[#064E2A]">{activeMarket.question}</h2>
              </div>
              <div className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <StatusBadge status={activeMarket.status} />
                  <span className="text-[10px] text-[#667085]">{activeMarket.templateCode}</span>
                </div>

                {/* Selections + liquidity */}
                <div className="grid grid-cols-2 gap-2 mb-3">
                  {activeMarket.selections.map((sel) => {
                    const liq = activeMarket.liquidity.filter((l) => l.selectionId === sel.id);
                    return (
                      <div key={sel.id} className="rounded-lg border border-[#E4E7EC] p-3">
                        <p className="text-sm font-bold text-[#101828]">{sel.label}</p>
                        <div className="mt-1.5 space-y-0.5">
                          {liq.length === 0 ? (
                            <p className="text-[10px] text-[#667085]">Pa gen likidite</p>
                          ) : liq.map((l, i) => (
                            <p key={i} className="text-[10px] text-[#667085] flex items-center justify-between">
                              <span>{formatHtg(l.stakeCentimes)}</span>
                              <span className="font-bold text-[#064E2A]">×{l.openOrderCount}</span>
                            </p>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Actions */}
                <div className="flex flex-wrap gap-2">
                  {activeMarket.status === "DRAFT" && (
                    <button onClick={() => publishMarket(activeMarket.id)} className="px-3 py-2 rounded-lg bg-[#116B3A] text-white text-xs font-bold flex items-center gap-1.5 hover:brightness-110 transition">
                      <Play size={13} /> Pibliye
                    </button>
                  )}
                  {activeMarket.status === "OPEN" && (
                    <button onClick={() => suspendMarket(activeMarket.id)} className="px-3 py-2 rounded-lg bg-[#F4C400] text-[#064E2A] text-xs font-bold flex items-center gap-1.5">
                      <Pause size={13} /> Sispann
                    </button>
                  )}
                  {activeMarket.status === "SUSPENDED" && (
                    <button onClick={() => publishMarket(activeMarket.id)} className="px-3 py-2 rounded-lg bg-[#116B3A] text-white text-xs font-bold flex items-center gap-1.5">
                      <Play size={13} /> Re-louvri
                    </button>
                  )}
                  {(activeMarket.status === "OPEN" || activeMarket.status === "SUSPENDED") && (
                    <>
                      <button onClick={() => closeMarket(activeMarket.id)} className="px-3 py-2 rounded-lg bg-[#667085] text-white text-xs font-bold flex items-center gap-1.5">
                        <X size={13} /> Fèmen
                      </button>
                      <button onClick={() => cancelMarket(activeMarket.id)} className="px-3 py-2 rounded-lg bg-[#D92D20] text-white text-xs font-bold flex items-center gap-1.5">
                        <AlertTriangle size={13} /> Anile
                      </button>
                    </>
                  )}
                  {(activeMarket.status === "CLOSED" || activeMarket.status === "SETTLED" || activeMarket.status === "CANCELLED") && (
                    <p className="text-xs text-[#667085] italic">Mache sa a fèmen. Kreye yon nouvo.</p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-xl bg-white shadow p-6 text-center">
              <p className="text-sm font-bold text-[#101828]">Pa gen mache aktif</p>
              <p className="text-xs text-[#667085] mt-1">Chwazi yon modèl nan bò dwat pou kreye youn.</p>
            </div>
          )}
        </div>

        {/* ═══ RIGHT: Create new market ═══ */}
        <aside className="space-y-4">
          {!activeMarket && (
            <div className="rounded-xl bg-white shadow-lg p-4">
              <h3 className="text-sm font-bold text-[#101828] mb-3">Kreye yon nouvo mache</h3>

              {/* Match selection */}
              <p className="text-[10px] font-bold text-[#667085] uppercase mb-1.5">Match</p>
              <select
                value={selectedMatch ?? ""}
                onChange={(e) => setSelectedMatch(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-[#E4E7EC] text-sm text-[#101828] mb-3"
              >
                <option value="">— Chwazi match —</option>
                {matches.map((m) => (
                  <option key={m.id} value={m.id}>{m.homeShort} vs {m.awayShort} ({m.status === "AN_DIRÈK" ? "Dirèk" : "Pwogram"})</option>
                ))}
              </select>

              {/* Template selection */}
              <p className="text-[10px] font-bold text-[#667085] uppercase mb-1.5">Modèl mache</p>
              <div className="space-y-1.5 mb-3">
                {templates.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setSelectedTemplate(t.code)}
                    className={cn("w-full text-left p-3 rounded-lg border-2 transition",
                      selectedTemplate === t.code ? "border-[#F4C400] bg-[#F4C400]/5" : "border-[#E4E7EC] hover:border-[#F4C400]/50")}
                  >
                    <p className="text-xs font-bold text-[#101828]">{t.code}</p>
                    <p className="text-[11px] text-[#667085] mt-0.5">{t.label}</p>
                  </button>
                ))}
              </div>

              {/* Config (for OVER/UNDER) */}
              {selectedTemplate === "TOTAL_GOALS_OVER" && (
                <div className="mb-3">
                  <p className="text-[10px] font-bold text-[#667085] uppercase mb-1.5">Total gòl (seuil)</p>
                  <input
                    type="number"
                    value={config.threshold ?? 2}
                    onChange={(e) => setConfig({ ...config, threshold: parseInt(e.target.value) || 2 })}
                    className="w-full px-3 py-2 rounded-lg border border-[#E4E7EC] text-sm text-[#101828]"
                  />
                </div>
              )}

              <button
                onClick={createMarket}
                disabled={loading || !selectedMatch || !selectedTemplate}
                className="w-full py-2.5 rounded-lg bg-[#064E2A] text-white font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? <Loader2 size={15} className="animate-spin" /> : "Kreye mache a"}
              </button>
            </div>
          )}

          {/* Stats */}
          <div className="rounded-xl bg-white shadow p-4">
            <h3 className="text-xs font-bold text-[#667085] uppercase mb-2">Estadistik</h3>
            <div className="space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-[#667085] flex items-center gap-1.5"><Users size={11} /> Moun ap parie</span>
                <span className="font-bold text-[#101828]">{activeMarket?.liquidity?.reduce((s, l) => s + l.openOrderCount, 0) ?? 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#667085] flex items-center gap-1.5"><TrendingUp size={11} /> Total likidite</span>
                <span className="font-bold text-[#101828]">{formatHtg(activeMarket?.liquidity?.reduce((s, l) => s + BigInt(l.stakeCentimes) * BigInt(l.openOrderCount), 0n) ?? 0n)}</span>
              </div>
            </div>
          </div>
        </aside>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
          <div className={cn("px-4 py-3 rounded-xl shadow-2xl flex items-center gap-2",
            toast.type === "success" && "bg-[#116B3A] text-white",
            toast.type === "error" && "bg-[#D92D20] text-white",
            toast.type === "info" && "bg-[#1D2939] text-white")}>
            {toast.type === "success" && <Check size={15} />}
            {toast.type === "error" && <X size={15} />}
            <span className="text-sm font-semibold">{toast.msg}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    DRAFT: "bg-[#667085] text-white",
    PUBLISHED: "bg-[#F4C400] text-[#064E2A]",
    OPEN: "bg-[#116B3A] text-white",
    SUSPENDED: "bg-[#D92D20] text-white",
    CLOSED: "bg-[#667085] text-white",
    SETTLING: "bg-[#F4C400] text-[#064E2A]",
    SETTLED: "bg-[#116B3A] text-white",
    CANCELLED: "bg-[#D92D20] text-white",
  };
  return (
    <span className={cn("px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider", colors[status] ?? "bg-[#667085] text-white")}>
      {status}
    </span>
  );
}
