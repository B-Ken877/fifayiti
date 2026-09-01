"use client";

// FIFAYITI PARIAJ — wallet page.
// Shows balance, in-play, transaction history, deposit/withdraw buttons.

import { useEffect, useState, useCallback } from "react";
import { useAppStore } from "@/store/app-store";
import {
  ArrowLeft, Wallet, ArrowDownToLine, ArrowUpFromLine,
  TrendingUp, Clock, Check, X, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatHtg, formatHtgPrecise } from "@/lib/betting/types";

interface WalletData {
  available: string;
  reserved: string;
  total: string;
}
interface Transaction {
  id: string;
  type: string;
  amount: string;
  balanceAfter: string;
  referenceType: string | null;
  referenceId: string | null;
  createdAt: string;
}

const TYPE_LABELS: Record<string, { label: string; color: string; sign: "+" | "-" }> = {
  DEPOSIT: { label: "Depo", color: "text-[#116B3A]", sign: "+" },
  WITHDRAWAL: { label: "Retrè", color: "text-[#D92D20]", sign: "-" },
  BET_RESERVE: { label: "Paryaj rezève", color: "text-[#667085]", sign: "-" },
  BET_RELEASE: { label: "Libere paryaj", color: "text-[#116B3A]", sign: "+" },
  BET_MATCH: { label: "Paryaj matche", color: "text-[#667085]", sign: "-" },
  BET_SETTLE_WIN: { label: "Paryaj genyen", color: "text-[#116B3A]", sign: "+" },
  BET_SETTLE_LOSS: { label: "Paryaj pèdi", color: "text-[#D92D20]", sign: "" },
  BET_REFUND: { label: "Ranbouse", color: "text-[#116B3A]", sign: "+" },
  COMMISSION: { label: "Komisyon", color: "text-[#D92D20]", sign: "-" },
  ADJUSTMENT: { label: "Ajustman", color: "text-[#667085]", sign: "" },
};

export function WalletPage() {
  const { setView } = useAppStore();
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [depositOpen, setDepositOpen] = useState(false);
  const [depositAmt, setDepositAmt] = useState("");
  const [depositing, setDepositing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [wRes, tRes] = await Promise.all([
        fetch("/api/betting/wallet", { cache: "no-store" }),
        fetch("/api/betting/wallet/transactions", { cache: "no-store" }),
      ]);
      if (wRes.ok) setWallet(await wRes.json());
      if (tRes.ok) { const d = await tRes.json(); setTransactions(d.transactions ?? []); }
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); const i = setInterval(load, 10000); return () => clearInterval(i); }, [load]);

  const handleDeposit = async () => {
    const centimes = BigInt(Math.round(parseFloat(depositAmt) * 100));
    if (centimes <= 0n || centimes > 1_000_000n) return;
    setDepositing(true);
    try {
      const res = await fetch("/api/betting/wallet/deposit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountCentimes: centimes.toString() }),
      });
      if (res.ok) {
        setDepositOpen(false);
        setDepositAmt("");
        load();
      }
    } finally { setDepositing(false); }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#064E2A] flex items-center justify-center">
        <Loader2 size={24} className="text-[#F4C400] animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#064E2A] pb-20">
      {/* ═══ HEADER ═══ */}
      <div className="sticky top-0 z-30 bg-[#064E2A]/95 backdrop-blur-md border-b border-white/10">
        <div className="max-w-[1400px] mx-auto px-4 py-3 flex items-center gap-2">
          <button onClick={() => setView("betting")} className="p-1.5 -ml-1.5 rounded-lg hover:bg-white/10 transition">
            <ArrowLeft size={18} className="text-white" />
          </button>
          <h1 className="text-base font-extrabold text-white">Poche</h1>
        </div>
      </div>

      <div className="max-w-[600px] mx-auto px-4 pt-4 space-y-4">
        {/* ═══ BALANCE CARD ═══ */}
        <div className="rounded-2xl bg-gradient-to-br from-[#0B6B3A] to-[#064E2A] border border-white/10 p-5">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-white/60 uppercase tracking-wider">Total balans</span>
            <Wallet size={16} className="text-[#F4C400]" />
          </div>
          <p className="text-4xl font-black text-white tnum mb-4">{formatHtg(wallet?.total ?? "0")}</p>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-white/10 p-3">
              <div className="flex items-center gap-1.5 mb-0.5">
                <TrendingUp size={11} className="text-[#F4C400]" />
                <span className="text-[10px] text-white/60 uppercase">Disponib</span>
              </div>
              <p className="text-lg font-bold text-white tnum">{formatHtg(wallet?.available ?? "0")}</p>
            </div>
            <div className="rounded-xl bg-white/10 p-3">
              <div className="flex items-center gap-1.5 mb-0.5">
                <Clock size={11} className="text-[#F4C400]" />
                <span className="text-[10px] text-white/60 uppercase">Nan jwèt</span>
              </div>
              <p className="text-lg font-bold text-white tnum">{formatHtg(wallet?.reserved ?? "0")}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 mt-3">
            <button
              onClick={() => setDepositOpen(true)}
              className="py-2.5 rounded-xl bg-[#F4C400] text-[#064E2A] font-bold text-sm hover:brightness-105 transition flex items-center justify-center gap-1.5"
            >
              <ArrowDownToLine size={14} /> Depoze
            </button>
            <button
              disabled
              className="py-2.5 rounded-xl bg-white/10 text-white/50 font-bold text-sm flex items-center justify-center gap-1.5 cursor-not-allowed"
              title="Peyman entegrasyon poko disponib"
            >
              <ArrowUpFromLine size={14} /> Retire
            </button>
          </div>
          <p className="text-[9px] text-white/30 mt-2 text-center">
            ⚠️ Retrè ap disponib lè entegrasyon peyman (MonCash/Natcash) fini.
          </p>
        </div>

        {/* ═══ DEPOSIT MODAL ═══ */}
        {depositOpen && (
          <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setDepositOpen(false)}>
            <div className="bg-white rounded-2xl p-5 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-base font-bold text-[#101828] mb-3">Depoze lajan</h3>
              <p className="text-xs text-[#667085] mb-3">Antre montan an HTG (demo — pa gen chaj peyman reyèl poko).</p>
              <input
                type="number"
                value={depositAmt}
                onChange={(e) => setDepositAmt(e.target.value)}
                placeholder="500"
                className="w-full px-3 py-2.5 rounded-lg border border-[#E4E7EC] text-lg font-bold text-[#101828] focus:outline-none focus:border-[#F4C400]"
              />
              <div className="grid grid-cols-3 gap-1.5 mt-2">
                {["100", "500", "1000"].map((amt) => (
                  <button
                    key={amt}
                    onClick={() => setDepositAmt(amt)}
                    className="py-1.5 rounded-lg bg-[#F8F9FA] border border-[#E4E7EC] text-xs font-bold text-[#101828] hover:border-[#F4C400] transition"
                  >
                    {amt} HTG
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2 mt-4">
                <button onClick={() => setDepositOpen(false)} className="py-2.5 rounded-lg bg-[#F8F9FA] text-[#101828] font-bold text-sm">
                  Anile
                </button>
                <button
                  onClick={handleDeposit}
                  disabled={depositing || !depositAmt}
                  className="py-2.5 rounded-lg bg-[#064E2A] text-white font-bold text-sm disabled:opacity-50"
                >
                  {depositing ? "..." : "Konfime"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ═══ TRANSACTIONS ═══ */}
        <div>
          <h3 className="text-sm font-bold text-white mb-2">Istwa tranzaksyon yo</h3>
          {transactions.length === 0 ? (
            <div className="rounded-xl bg-white/5 border border-white/10 p-6 text-center">
              <p className="text-xs text-white/40">Pa gen tranzaksyon poko.</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {transactions.map((t) => {
                const meta = TYPE_LABELS[t.type] ?? { label: t.type, color: "text-[#667085]", sign: "" };
                const amount = BigInt(t.amount);
                const isPositive = amount > 0n;
                return (
                  <div key={t.id} className="rounded-lg bg-white shadow-sm p-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={cn("w-9 h-9 rounded-full flex items-center justify-center",
                        isPositive ? "bg-[#116B3A]/10" : amount < 0n ? "bg-[#D92D20]/10" : "bg-[#F4C400]/10")}>
                        {isPositive ? <Check size={15} className="text-[#116B3A]" /> : amount < 0n ? <X size={15} className="text-[#D92D20]" /> : <Clock size={15} className="text-[#F4C400]" />}
                      </div>
                      <div>
                        <p className="text-xs font-bold text-[#101828]">{meta.label}</p>
                        <p className="text-[10px] text-[#667085]">{new Date(t.createdAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}</p>
                      </div>
                    </div>
                    <p className={cn("text-sm font-extrabold tnum", meta.color)}>
                      {meta.sign}{formatHtgPrecise(amount < 0n ? -amount : amount)}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
