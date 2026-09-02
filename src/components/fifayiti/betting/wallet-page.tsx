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
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [withdrawAmt, setWithdrawAmt] = useState("");
  const [withdrawPhone, setWithdrawPhone] = useState("");
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawToast, setWithdrawToast] = useState<string | null>(null);

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

  // ── Withdraw (placeholder — MonCash/Natcash integration is stubbed) ──
  // The UI collects the amount + phone number + method, then shows a
  // "pending" toast. Real integration will POST to /api/betting/wallet/withdraw
  // once the payment gateway is wired.
  const handleWithdraw = async (method: "moncash" | "natcash") => {
    const centimes = BigInt(Math.round(parseFloat(withdrawAmt) * 100));
    if (centimes <= 0n) return;
    if (!withdrawPhone.trim()) {
      setWithdrawToast("Antre nimewo telefòn ou.");
      setTimeout(() => setWithdrawToast(null), 3000);
      return;
    }
    if (wallet && BigInt(wallet.available) < centimes) {
      setWithdrawToast("Solde disponib ou pa ase.");
      setTimeout(() => setWithdrawToast(null), 3000);
      return;
    }
    setWithdrawing(true);
    // Simulate a payment gateway call (placeholder).
    await new Promise((r) => setTimeout(r, 1200));
    setWithdrawing(false);
    setWithdrawOpen(false);
    setWithdrawToast(`Demand retrè ${formatHtg(centimes)} via ${method === "moncash" ? "MonCash" : "Natcash"} anrejistre. N ap trete li nan 24 èdtan.`);
    setTimeout(() => setWithdrawToast(null), 5000);
    setWithdrawAmt("");
    setWithdrawPhone("");
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
              onClick={() => setWithdrawOpen(true)}
              className="py-2.5 rounded-xl bg-white/10 text-white font-bold text-sm flex items-center justify-center gap-1.5 hover:bg-white/15 transition"
            >
              <ArrowUpFromLine size={14} /> Retire
            </button>
          </div>
          <p className="text-[9px] text-white/30 mt-2 text-center">
            MonCash ak Natcash ap disponib pou tès. Peyman reyèl ap bientò.
          </p>
        </div>

        {/* ═══ DEPOSIT MODAL ═══ */}
        {depositOpen && (
          <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setDepositOpen(false)}>
            <div className="bg-white rounded-2xl p-5 max-w-sm w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-bold text-[#101828]">Depoze lajan</h3>
                <button onClick={() => setDepositOpen(false)} className="p-1 rounded-lg hover:bg-[#F8F9FA]">
                  <X size={16} className="text-[#667085]" />
                </button>
              </div>

              {/* Amount input */}
              <p className="text-[10px] font-bold text-[#667085] uppercase mb-1.5">Montan</p>
              <input
                type="number"
                value={depositAmt}
                onChange={(e) => setDepositAmt(e.target.value)}
                placeholder="500"
                className="w-full px-3 py-2.5 rounded-lg border border-[#E4E7EC] text-lg font-bold text-[#101828] focus:outline-none focus:border-[#F4C400] mb-2"
              />
              <div className="grid grid-cols-3 gap-1.5 mb-4">
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

              {/* Payment methods */}
              <p className="text-[10px] font-bold text-[#667085] uppercase mb-2">Metòd peyman</p>
              <div className="space-y-2 mb-4">
                {/* MonCash placeholder */}
                <button
                  onClick={handleDeposit}
                  disabled={depositing || !depositAmt}
                  className="w-full flex items-center gap-3 p-3 rounded-xl border-2 border-[#E4E7EC] hover:border-[#F4C400] transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#FF6B35] to-[#E55A2B] flex items-center justify-center shrink-0">
                    <span className="text-white font-black text-xs">M</span>
                  </div>
                  <div className="flex-1 text-left">
                    <p className="text-sm font-bold text-[#101828]">MonCash</p>
                    <p className="text-[10px] text-[#667085]">Peyman mobil — Digitel</p>
                  </div>
                  {depositing && <Loader2 size={14} className="text-[#667085] animate-spin" />}
                </button>

                {/* Natcash placeholder */}
                <button
                  onClick={handleDeposit}
                  disabled={depositing || !depositAmt}
                  className="w-full flex items-center gap-3 p-3 rounded-xl border-2 border-[#E4E7EC] hover:border-[#F4C400] transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#0066B3] to-[#005299] flex items-center justify-center shrink-0">
                    <span className="text-white font-black text-xs">N</span>
                  </div>
                  <div className="flex-1 text-left">
                    <p className="text-sm font-bold text-[#101828]">Natcash</p>
                    <p className="text-[10px] text-[#667085]">Peyman mobil — Natcom</p>
                  </div>
                  {depositing && <Loader2 size={14} className="text-[#667085] animate-spin" />}
                </button>

                {/* Demo / test deposit */}
                <button
                  onClick={handleDeposit}
                  disabled={depositing || !depositAmt}
                  className="w-full flex items-center gap-3 p-3 rounded-xl border-2 border-dashed border-[#F4C400] bg-[#F4C400]/5 hover:bg-[#F4C400]/10 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="w-10 h-10 rounded-lg bg-[#F4C400]/20 flex items-center justify-center shrink-0">
                    <Wallet size={18} className="text-[#F4C400]" />
                  </div>
                  <div className="flex-1 text-left">
                    <p className="text-sm font-bold text-[#064E2A]">Demo Depo</p>
                    <p className="text-[10px] text-[#667085]">Pou tès sèlman — pa gen lajan reyèl</p>
                  </div>
                  {depositing && <Loader2 size={14} className="text-[#667085] animate-spin" />}
                </button>
              </div>

              <p className="text-[9px] text-[#667085] text-center mb-3">
                ⚠️ MonCash ak Natcash yo ap konfigire. Pou kounye a, sèlman Demo Depo ap mache.
              </p>

              <button
                onClick={() => setDepositOpen(false)}
                className="w-full py-2.5 rounded-lg bg-[#F8F9FA] text-[#101828] font-bold text-sm hover:bg-[#F0F2F5] transition"
              >
                Anile
              </button>
            </div>
          </div>
        )}

        {/* ═══ WITHDRAW MODAL ═══ */}
        {withdrawOpen && (
          <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setWithdrawOpen(false)}>
            <div className="bg-white rounded-2xl p-5 max-w-sm w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-bold text-[#101828]">Retire lajan</h3>
                <button onClick={() => setWithdrawOpen(false)} className="p-1 rounded-lg hover:bg-[#F8F9FA]">
                  <X size={16} className="text-[#667085]" />
                </button>
              </div>

              {/* Amount input */}
              <p className="text-[10px] font-bold text-[#667085] uppercase mb-1.5">Montan</p>
              <input
                type="number"
                value={withdrawAmt}
                onChange={(e) => setWithdrawAmt(e.target.value)}
                placeholder="500"
                className="w-full px-3 py-2.5 rounded-lg border border-[#E4E7EC] text-lg font-bold text-[#101828] focus:outline-none focus:border-[#F4C400] mb-2"
              />
              <p className="text-[10px] text-[#667085] mb-3">
                Disponib: {formatHtg(wallet?.available ?? "0")}
              </p>

              {/* Phone number */}
              <p className="text-[10px] font-bold text-[#667085] uppercase mb-1.5">Nimewo telefòn</p>
              <input
                type="tel"
                value={withdrawPhone}
                onChange={(e) => setWithdrawPhone(e.target.value)}
                placeholder="+509 3xxx xxxx"
                className="w-full px-3 py-2.5 rounded-lg border border-[#E4E7EC] text-sm font-medium text-[#101828] focus:outline-none focus:border-[#F4C400] mb-4"
              />

              {/* Payment methods */}
              <p className="text-[10px] font-bold text-[#667085] uppercase mb-2">Metòd retrè</p>
              <div className="space-y-2 mb-4">
                <button
                  onClick={() => handleWithdraw("moncash")}
                  disabled={withdrawing || !withdrawAmt}
                  className="w-full flex items-center gap-3 p-3 rounded-xl border-2 border-[#E4E7EC] hover:border-[#F4C400] transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#FF6B35] to-[#E55A2B] flex items-center justify-center shrink-0">
                    <span className="text-white font-black text-xs">M</span>
                  </div>
                  <div className="flex-1 text-left">
                    <p className="text-sm font-bold text-[#101828]">MonCash</p>
                    <p className="text-[10px] text-[#667085]">Retrè nan 24è — Digitel</p>
                  </div>
                  {withdrawing && <Loader2 size={14} className="text-[#667085] animate-spin" />}
                </button>

                <button
                  onClick={() => handleWithdraw("natcash")}
                  disabled={withdrawing || !withdrawAmt}
                  className="w-full flex items-center gap-3 p-3 rounded-xl border-2 border-[#E4E7EC] hover:border-[#F4C400] transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#0066B3] to-[#005299] flex items-center justify-center shrink-0">
                    <span className="text-white font-black text-xs">N</span>
                  </div>
                  <div className="flex-1 text-left">
                    <p className="text-sm font-bold text-[#101828]">Natcash</p>
                    <p className="text-[10px] text-[#667085]">Retrè nan 24è — Natcom</p>
                  </div>
                  {withdrawing && <Loader2 size={14} className="text-[#667085] animate-spin" />}
                </button>
              </div>

              <p className="text-[9px] text-[#667085] text-center mb-3">
                ⚠️ MonCash ak Natcash yo ap konfigire. Demand ou ap anrejistre pou tès.
              </p>

              <button
                onClick={() => setWithdrawOpen(false)}
                className="w-full py-2.5 rounded-lg bg-[#F8F9FA] text-[#101828] font-bold text-sm hover:bg-[#F0F2F5] transition"
              >
                Anile
              </button>
            </div>
          </div>
        )}

        {/* ═══ WITHDRAW TOAST ═══ */}
        {withdrawToast && (
          <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-4 duration-300">
            <div className="px-4 py-3 rounded-xl shadow-2xl bg-[#1D2939] text-white flex items-center gap-2 max-w-[90vw]">
              <Check size={15} className="text-[#F4C400] shrink-0" />
              <span className="text-xs font-semibold">{withdrawToast}</span>
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
