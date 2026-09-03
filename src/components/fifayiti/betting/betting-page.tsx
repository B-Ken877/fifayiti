"use client";

// FIFAYITI PARIAJ — public betting page.
//
// Mobile-first, Haitian Creole, premium feel. Shows:
//   - The current live match (score + clock)
//   - The ONE active market (question + selections + stake pools)
//   - The bettor's wallet balance
//   - Live liquidity per stake pool
//   - Bet submission → matching → confirmation flow
//   - The bettor's open/matched positions
//
// Real-time: polls /api/betting/markets/active every 3s + subscribes to
// the LiveKit data channel for immediate bet-match + market-settle events.

import { useEffect, useState, useRef, useCallback } from "react";
import { useAppStore } from "@/store/app-store";
import {
  Flame, Wallet, ArrowLeft, Zap, Check, X, Loader2, Clock, Users, Trophy, LogIn,
  ArrowDownToLine, TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatHtg } from "@/lib/betting/types";

interface ActiveMarket {
  active: boolean;
  market: {
    id: string;
    question: string;
    status: string;
    templateCode: string;
    selections: { id: string; key: string; label: string }[];
    liquidity: { selectionId: string; stakeCentimes: string; openOrderCount: number }[];
    match: {
      id: string;
      homeShort: string;
      awayShort: string;
      homeColor: string;
      awayColor: string;
      homeScore: number;
      awayScore: number;
      clock: number;
      half: string;
    };
  } | null;
}

interface StakePool { id: string; amountCentimes: string; label: string; }
interface BettorInfo { authenticated: boolean; bettor?: { id: string; email: string; displayName?: string | null }; }
interface UserBet {
  id: string;
  marketQuestion: string;
  marketStatus: string;
  selectionKey: string;
  selectionLabel: string;
  stakeCentimes: string;
  status: string;
  matchedAt: string | null;
  settledAt: string | null;
  settleOutcome: string | null;
  payoutCentimes: string | null;
  matchHome: string | null;
  matchAway: string | null;
  createdAt: string;
}

export function BettingPage() {
  const { setView } = useAppStore();
  const [market, setMarket] = useState<ActiveMarket | null>(null);
  const [pools, setPools] = useState<StakePool[]>([]);
  const [bettor, setBettor] = useState<BettorInfo | null>(null);
  const [walletAvail, setWalletAvail] = useState<string>("0");
  const [walletReserved, setWalletReserved] = useState<string>("0");
  const [bets, setBets] = useState<UserBet[]>([]);
  const [selectedSelection, setSelectedSelection] = useState<string | null>(null);
  const [selectedStake, setSelectedStake] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error" | "info"; msg: string } | null>(null);
  const idempotencyRef = useRef<string | null>(null);

  const showToast = useCallback((type: "success" | "error" | "info", msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 4000);
  }, []);

  // ── Load bettor session + wallet + bets ──
  const loadBettor = useCallback(async () => {
    try {
      const [meRes, walletRes, betsRes] = await Promise.all([
        fetch("/api/betting/auth/me", { cache: "no-store" }),
        fetch("/api/betting/wallet", { cache: "no-store" }),
        fetch("/api/betting/bets", { cache: "no-store" }),
      ]);
      setBettor(await meRes.json());
      if (walletRes.ok) {
        const w = await walletRes.json();
        setWalletAvail(w.available ?? "0");
        setWalletReserved(w.reserved ?? "0");
      }
      if (betsRes.ok) {
        const b = await betsRes.json();
        setBets(b.bets ?? []);
      }
    } catch {}
  }, []);

  useEffect(() => { loadBettor(); }, [loadBettor]);

  // ── Poll active market + stake pools ──
  useEffect(() => {
    const load = async () => {
      try {
        const [mRes, pRes] = await Promise.all([
          fetch("/api/betting/markets/active", { cache: "no-store" }),
          fetch("/api/betting/stake-pools", { cache: "no-store" }),
        ]);
        if (mRes.ok) setMarket(await mRes.json());
        if (pRes.ok) { const p = await pRes.json(); setPools(p.pools ?? []); }
      } catch {}
    };
    load();
    const i = setInterval(load, 3000);
    return () => clearInterval(i);
  }, []);

  // ── Place a bet ──
  const placeBet = async () => {
    if (!market?.market || !selectedSelection || !selectedStake) return;
    if (!bettor?.authenticated) {
      showToast("info", "Ou dwe konekte pou w parie.");
      setView("betting-login");
      return;
    }
    setPlacing(true);
    idempotencyRef.current = `${Date.now()}-${Math.random()}`;
    try {
      const res = await fetch("/api/betting/bets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          marketId: market.market.id,
          selectionId: selectedSelection,
          stakeCentimes: selectedStake,
          idempotencyKey: idempotencyRef.current,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast("error", data.error ?? "Erè pandan pariyaj.");
      } else if (data.matched) {
        showToast("success", "Paryaj ou a jwenn!");
        setSelectedSelection(null);
        setSelectedStake(null);
      } else {
        showToast("info", "N ap chèche yon parye opoze pou ou...");
        setSelectedSelection(null);
        setSelectedStake(null);
      }
      loadBettor();
    } catch {
      showToast("error", "Erè rezo. Eseye ankò.");
    } finally {
      setPlacing(false);
    }
  };

  // ── Render ──
  const match = market?.market?.match;
  const m = market?.market;
  const isLive = market?.active && m?.status === "OPEN";

  return (
    <div className="min-h-screen bg-[#064E2A] pb-20">
      {/* ═══ HEADER — FIFAYITI PARIAJ with ball + inline wallet ═══ */}
      <div className="sticky top-0 z-30 bg-[#064E2A]/95 backdrop-blur-md border-b border-white/10">
        <div className="max-w-[1400px] mx-auto px-4 py-2.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <button onClick={() => setView("home")} className="p-1.5 -ml-1.5 rounded-lg hover:bg-white/10 transition shrink-0">
              <ArrowLeft size={18} className="text-white" />
            </button>
            <div className="flex items-center gap-2 min-w-0">
              {/* Soccer ball badge — the PARIAJ identity */}
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#F4C400] to-[#E0B000] flex items-center justify-center shrink-0 shadow-md">
                <svg viewBox="0 0 32 32" className="w-5 h-5" fill="none">
                  <circle cx="16" cy="16" r="13" fill="#064E2A" />
                  <path d="M16 6 L19 11 L17 16 L15 16 L13 11 Z" fill="#fff" />
                  <path d="M16 16 L21 14 L25 18 L22 22 L18 20 Z" fill="#fff" />
                  <path d="M16 16 L11 14 L7 18 L10 22 L14 20 Z" fill="#fff" />
                  <path d="M16 16 L17 22 L13 24 L11 21 Z" fill="#fff" />
                </svg>
              </div>
              <div className="min-w-0">
                <h1 className="text-sm font-black text-white tracking-tight truncate">
                  FIFAYITI <span className="text-[#F4C400]">PARIAJ</span>
                </h1>
                <p className="text-[8px] text-white/40 -mt-0.5 uppercase tracking-wider">P2P Live Betting</p>
              </div>
            </div>
          </div>

          {/* Right side: inline wallet (authenticated) or login button */}
          {bettor?.authenticated ? (
            <button
              onClick={() => setView("betting-wallet")}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 transition shrink-0"
              title="Wè poche ou"
            >
              <Wallet size={14} className="text-[#F4C400]" />
              <span className="text-xs font-extrabold text-white tnum">{formatHtg(walletAvail)}</span>
            </button>
          ) : (
            <button
              onClick={() => setView("betting-login")}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#F4C400] hover:brightness-105 transition shrink-0"
            >
              <LogIn size={13} className="text-[#064E2A]" />
              <span className="text-xs font-extrabold text-[#064E2A]">Konekte</span>
            </button>
          )}
        </div>

        {/* ═══ COMPACT WALLET STRIP — visible immediately after login ═══
            Shows available + in-play + a small deposit button. Compact,
            single-row, doesn't distract from the betting experience. */}
        {bettor?.authenticated && (
          <div className="max-w-[1400px] mx-auto px-4 pb-2.5 -mt-0.5">
            <div className="flex items-center gap-3 px-3 py-2 rounded-xl bg-black/30 border border-white/10">
              {/* Available */}
              <div className="flex items-center gap-1.5">
                <Wallet size={12} className="text-[#F4C400]" />
                <span className="text-[9px] text-white/50 uppercase tracking-wider">Disponib</span>
                <span className="text-xs font-bold text-white tnum">{formatHtg(walletAvail)}</span>
              </div>
              <div className="w-px h-4 bg-white/15" />
              {/* In play */}
              <div className="flex items-center gap-1.5">
                <TrendingUp size={12} className="text-[#F4C400]" />
                <span className="text-[9px] text-white/50 uppercase tracking-wider">Nan jwèt</span>
                <span className="text-xs font-bold text-white tnum">{formatHtg(walletReserved)}</span>
              </div>
              <div className="flex-1" />
              {/* Compact deposit button */}
              <button
                onClick={() => setView("betting-wallet")}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#F4C400]/15 hover:bg-[#F4C400]/25 border border-[#F4C400]/30 transition"
                title="Depoze lajan"
              >
                <ArrowDownToLine size={11} className="text-[#F4C400]" />
                <span className="text-[10px] font-bold text-[#F4C400]">Depoze</span>
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="max-w-[1400px] mx-auto px-4 pt-4 lg:grid lg:grid-cols-[1fr_360px] lg:gap-5">
        <div className="space-y-4">
          {/* ═══ LIVE MATCH SCORE ═══ */}
          {match && (
            <div className="rounded-xl bg-gradient-to-br from-[#0B6B3A] to-[#064E2A] border border-white/10 p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#D92D20]">
                  <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                  <span className="text-[9px] font-extrabold text-white uppercase tracking-wider">An Dirèk</span>
                </div>
                <div className="flex items-center gap-1 text-white/60">
                  <Clock size={11} />
                  <span className="text-xs tnum font-semibold">
                    {Math.floor((match.clock ?? 0) / 60)}'{String(Math.floor((match.clock ?? 0) % 60)).padStart(2, "0")}
                  </span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-sm" style={{ background: match.homeColor }} />
                  <span className="text-lg font-extrabold text-white">{match.homeShort}</span>
                </div>
                <div className="text-3xl font-black text-white tnum">{match.homeScore} - {match.awayScore}</div>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-extrabold text-white">{match.awayShort}</span>
                  <div className="w-3 h-3 rounded-sm" style={{ background: match.awayColor }} />
                </div>
              </div>
            </div>
          )}

          {/* ═══ NOT-AUTHENTICATED BANNER ═══ */}
          {bettor && !bettor.authenticated && (
            <div className="rounded-xl bg-gradient-to-r from-[#F4C400] to-[#E0B000] p-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-extrabold text-[#064E2A]">Kreye kont pou w parie</p>
                <p className="text-[11px] text-[#064E2A]/80 mt-0.5">Ou jwenn 500 HTG demo pou kòmanse.</p>
              </div>
              <button
                onClick={() => setView("betting-login")}
                className="px-4 py-2 rounded-lg bg-[#064E2A] text-white text-xs font-extrabold whitespace-nowrap hover:bg-[#0B6B3A] transition"
              >
                Enskri / Konekte
              </button>
            </div>
          )}

          {/* ═══ ACTIVE MARKET ═══ */}
          {isLive && m ? (
            <div className="rounded-xl bg-white shadow-lg overflow-hidden">
              <div className="px-4 pt-4 pb-3 bg-gradient-to-r from-[#F4C400] to-[#E0B000]">
                <div className="flex items-center gap-1.5 mb-1">
                  <Flame size={13} className="text-[#064E2A]" />
                  <span className="text-[10px] font-extrabold text-[#064E2A] uppercase tracking-wider">Pariaj Kounye a</span>
                </div>
                <h2 className="text-base font-extrabold text-[#064E2A]">{m.question}</h2>
              </div>

              <div className="p-4">
                {/* Selections */}
                <div className="grid grid-cols-2 gap-2.5 mb-4">
                  {m.selections.map((sel) => {
                    const selected = selectedSelection === sel.id;
                    const liquidity = m.liquidity.filter((l) => l.selectionId === sel.id);
                    return (
                      <button
                        key={sel.id}
                        onClick={() => setSelectedSelection(sel.id)}
                        className={cn(
                          "relative rounded-xl border-2 p-4 transition-all text-center",
                          selected
                            ? "border-[#F4C400] bg-[#F4C400]/10 shadow-md"
                            : "border-[#E4E7EC] bg-white hover:border-[#F4C400]/50"
                        )}
                      >
                        <p className={cn("text-sm font-extrabold", selected ? "text-[#064E2A]" : "text-[#101828]")}>
                          {sel.label}
                        </p>
                        {liquidity.length > 0 && (
                          <p className="text-[9px] text-[#667085] mt-1">
                            {liquidity.reduce((s, l) => s + l.openOrderCount, 0)} moun vle parie
                          </p>
                        )}
                        {selected && (
                          <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-[#F4C400] flex items-center justify-center">
                            <Check size={13} className="text-[#064E2A]" strokeWidth={3} />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Stake pools */}
                {selectedSelection && (
                  <div className="animate-in fade-in slide-in-from-top-2 duration-200">
                    <p className="text-[10px] font-bold text-[#667085] uppercase mb-2">Chwazi montan</p>
                    <div className="grid grid-cols-3 gap-2 mb-4">
                      {pools.map((p) => {
                        const selected = selectedStake === p.amountCentimes;
                        const enough = BigInt(walletAvail) >= BigInt(p.amountCentimes);
                        return (
                          <button
                            key={p.id}
                            onClick={() => setSelectedStake(p.amountCentimes)}
                            disabled={!enough}
                            className={cn(
                              "rounded-lg border-2 py-2.5 px-1 transition-all",
                              selected
                                ? "border-[#F4C400] bg-[#F4C400]/10"
                                : enough
                                  ? "border-[#E4E7EC] hover:border-[#F4C400]/50"
                                  : "border-[#E4E7EC] opacity-40 cursor-not-allowed"
                            )}
                          >
                            <p className={cn("text-xs font-extrabold", selected ? "text-[#064E2A]" : "text-[#101828]")}>
                              {p.label}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Place bet button */}
                {selectedSelection && selectedStake && (
                  bettor?.authenticated ? (
                    <button
                      onClick={placeBet}
                      disabled={placing}
                      className="w-full py-3.5 rounded-xl bg-[#064E2A] text-white font-extrabold text-sm shadow-lg hover:bg-[#0B6B3A] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {placing ? (
                        <><Loader2 size={15} className="animate-spin" /> N ap trete...</>
                      ) : (
                        <>Pariye {formatHtg(selectedStake)}</>
                      )}
                    </button>
                  ) : (
                    <button
                      onClick={() => setView("betting-login")}
                      className="w-full py-3.5 rounded-xl bg-[#F4C400] text-[#064E2A] font-extrabold text-sm shadow-lg hover:brightness-105 transition-all flex items-center justify-center gap-2"
                    >
                      <LogIn size={15} /> Konekte pou w parie
                    </button>
                  )
                )}

                {!selectedSelection && (
                  <div className="text-center py-3 text-xs text-[#667085]">
                    Chwazi yon ekip pou w kontinye.
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-xl bg-white shadow p-8 text-center">
              <Flame size={32} className="mx-auto text-[#F4C400] mb-2" />
              <p className="text-sm font-bold text-[#101828]">Pa gen mache pariaj aktif kounye a</p>
              <p className="text-xs text-[#667085] mt-1">Tounen lè operatè a louvri yon mache.</p>
            </div>
          )}

          {/* ═══ YOUR POSITIONS ═══ */}
          {bettor?.authenticated && bets.length > 0 && (
            <div>
              <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-1.5">
                <Trophy size={14} className="text-[#F4C400]" /> Parye ou yo
              </h3>
              <div className="space-y-2">
                {bets.slice(0, 5).map((b) => (
                  <BetCard key={b.id} bet={b} />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ═══ SIDEBAR (desktop) ═══ */}
        <aside className="hidden lg:flex flex-col gap-3">
          <div className="rounded-xl bg-white shadow p-4">
            <h3 className="text-sm font-bold text-[#101828] mb-3 flex items-center gap-1.5">
              <Users size={14} className="text-[#F4C400]" /> Ki jan pariaj mache
            </h3>
            <ol className="space-y-2.5 text-xs text-[#667085]">
              <li className="flex gap-2"><span className="font-bold text-[#F4C400]">1.</span> Chwazi prediksyon ou</li>
              <li className="flex gap-2"><span className="font-bold text-[#F4C400]">2.</span> Chwazi montan (50, 100, 250, 500, oswa 1000 HTG)</li>
              <li className="flex gap-2"><span className="font-bold text-[#F4C400]">3.</span> N ap chèche yon moun ki gen menm prediksyon opoze</li>
              <li className="flex gap-2"><span className="font-bold text-[#F4C400]">4.</span> Lè yo matche, lajan yo bloke</li>
              <li className="flex gap-2"><span className="font-bold text-[#F4C400]">5.</span> Match la fini — moun ki genyen yo pran lajan yo (mwens 5% komisyon)</li>
            </ol>
          </div>

          {bettor?.authenticated && (
            <div className="rounded-xl bg-gradient-to-br from-[#0B6B3A] to-[#064E2A] border border-white/10 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-white/60">Solde Disponib</span>
                <Wallet size={14} className="text-[#F4C400]" />
              </div>
              <p className="text-2xl font-black text-white tnum">{formatHtg(walletAvail)}</p>
              <button
                onClick={() => setView("betting-wallet")}
                className="mt-3 w-full py-2 rounded-lg bg-[#F4C400] text-[#064E2A] font-bold text-xs hover:brightness-105 transition"
              >
                Poche ou
              </button>
            </div>
          )}
        </aside>
      </div>

      {/* ═══ TOAST ═══ */}
      {toast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-4 duration-300">
          <div className={cn(
            "px-4 py-3 rounded-xl shadow-2xl flex items-center gap-2 max-w-[90vw]",
            toast.type === "success" && "bg-[#116B3A] text-white",
            toast.type === "error" && "bg-[#D92D20] text-white",
            toast.type === "info" && "bg-[#1D2939] text-white"
          )}>
            {toast.type === "success" && <Check size={16} />}
            {toast.type === "error" && <X size={16} />}
            {toast.type === "info" && <Loader2 size={16} className="animate-spin" />}
            <span className="text-sm font-semibold">{toast.msg}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function BetCard({ bet }: { bet: UserBet }) {
  const statusColors: Record<string, string> = {
    OPEN: "bg-[#F4C400] text-[#064E2A]",
    MATCHED: "bg-[#116B3A] text-white",
    SETTLED: "bg-[#667085] text-white",
    CANCELLED: "bg-[#D92D20] text-white",
    MARKET_CANCELLED: "bg-[#D92D20] text-white",
  };
  const statusLabels: Record<string, string> = {
    OPEN: "Ap tann",
    MATCHED: "Matche",
    SETTLED: "Fini",
    CANCELLED: "Anile",
    MARKET_CANCELLED: "Ranbouse",
  };
  const won = bet.status === "SETTLED" && bet.settleOutcome === "WIN";
  const lost = bet.status === "SETTLED" && bet.settleOutcome === "LOSS";

  return (
    <div className="rounded-xl bg-white shadow-sm p-3 border border-[#E4E7EC]">
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-[#101828] truncate">{bet.marketQuestion}</p>
          <p className="text-[10px] text-[#667085]">{bet.matchHome} vs {bet.matchAway}</p>
        </div>
        <span className={cn("px-1.5 py-0.5 rounded text-[9px] font-bold shrink-0", statusColors[bet.status] ?? "bg-[#667085] text-white")}>
          {statusLabels[bet.status] ?? bet.status}
        </span>
      </div>
      <div className="flex items-center justify-between mt-1.5">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-bold text-[#064E2A]">{bet.selectionLabel}</span>
          <span className="text-xs text-[#667085]">·</span>
          <span className="text-xs font-bold text-[#101828] tnum">{formatHtg(bet.stakeCentimes)}</span>
        </div>
        {won && <span className="text-xs font-extrabold text-[#116B3A] tnum">+{formatHtg(bet.payoutCentimes)}</span>}
        {lost && <span className="text-xs font-extrabold text-[#D92D20]">Pèdi</span>}
      </div>
    </div>
  );
}
