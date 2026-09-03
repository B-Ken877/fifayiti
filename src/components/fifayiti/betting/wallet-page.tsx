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
import { BrandMark } from "../brand-mark";

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

  const handleDeposit = async (provider: "moncash" | "natcash" | "demo" = "demo") => {
    const centimes = BigInt(Math.round(parseFloat(depositAmt) * 100));
    if (centimes <= 0n || centimes > 1_000_000n) return;
    setDepositing(true);
    try {
      // Use the new payment-provider flow. In dev/test the "demo" provider
      // simulates a verified webhook; in production only real providers
      // (MonCash/Natcash) work — the demo returns 403.
      const res = await fetch("/api/betting/wallet/deposit/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountCentimes: centimes.toString(),
          provider,
          returnUrl: "/betting-wallet",
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setDepositOpen(false);
        setDepositAmt("");
        load();
        if (data.redirectUrl) {
          // Real provider — redirect to checkout.
          window.location.href = data.redirectUrl;
        }
      } else {
        setWithdrawToast(data.error ?? "Erè depo.");
        setTimeout(() => setWithdrawToast(null), 4000);
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
      {/* ═══ HEADER — normal FIFAYITI header + PARIAJ label (no tagline) ═══ */}
      <div className="sticky top-0 z-30 bg-[#084C2A] text-white border-b border-fifayiti-line">
        <div className="max-w-[1400px] mx-auto px-4 lg:px-6">
          <div className="flex items-center justify-between" style={{ height: 60 }}>
            <button
              onClick={() => setView("betting")}
              className="flex items-center cursor-pointer text-left"
              aria-label="FIFAYITI PARIAJ"
            >
              <BrandMark size="compact" variant="white" showTagline={false} />
              <span
                className="ml-2 font-extrabold tracking-tight"
                style={{
                  fontSize: 18,
                  color: "#F4C400",
                  letterSpacing: "-0.02em",
                  fontFamily: "var(--font-archivo), var(--font-manrope), sans-serif",
                }}
              >
                PARIAJ
              </span>
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-[600px] mx-auto px-4 pt-4 space-y-4">
        {/* ═══ BALANCE CARD — professional, serious, like a real wallet ═══ */}
        <div className="rounded-xl bg-white shadow-sm border border-[#E4E7EC] overflow-hidden">
          {/* Card header */}
          <div className="px-5 py-3 bg-[#F8F9FA] border-b border-[#E4E7EC] flex items-center justify-between">
            <span className="text-[10px] font-bold text-[#667085] uppercase tracking-widest">Poche</span>
            <Wallet size={14} className="text-[#667085]" />
          </div>

          {/* Total balance — the hero number */}
          <div className="px-5 pt-5 pb-4">
            <p className="text-[10px] font-semibold text-[#667085] uppercase tracking-wider mb-1">Total balans</p>
            <p className="text-3xl font-black text-[#101828] tnum tracking-tight">
              {formatHtg(wallet?.total ?? "0")}
            </p>
          </div>

          {/* Divider */}
          <div className="h-px bg-[#E4E7EC]" />

          {/* Available + In-play — clean two-column breakdown */}
          <div className="grid grid-cols-2">
            <div className="px-5 py-4 border-r border-[#E4E7EC]">
              <div className="flex items-center gap-1.5 mb-1">
                <TrendingUp size={11} className="text-[#116B3A]" />
                <span className="text-[9px] font-bold text-[#667085] uppercase tracking-wider">Disponib</span>
              </div>
              <p className="text-xl font-extrabold text-[#101828] tnum">{formatHtg(wallet?.available ?? "0")}</p>
              <p className="text-[9px] text-[#667085] mt-0.5">Pou pariyaj</p>
            </div>
            <div className="px-5 py-4">
              <div className="flex items-center gap-1.5 mb-1">
                <Clock size={11} className="text-[#F4C400]" />
                <span className="text-[9px] font-bold text-[#667085] uppercase tracking-wider">Nan jwèt</span>
              </div>
              <p className="text-xl font-extrabold text-[#101828] tnum">{formatHtg(wallet?.reserved ?? "0")}</p>
              <p className="text-[9px] text-[#667085] mt-0.5">Paryaj kouran</p>
            </div>
          </div>

          {/* Actions */}
          <div className="grid grid-cols-2 border-t border-[#E4E7EC]">
            <button
              onClick={() => setDepositOpen(true)}
              className="py-3 text-sm font-bold text-[#064E2A] hover:bg-[#F8F9FA] transition flex items-center justify-center gap-1.5 border-r border-[#E4E7EC]"
            >
              <ArrowDownToLine size={14} /> Depoze
            </button>
            <button
              onClick={() => setWithdrawOpen(true)}
              className="py-3 text-sm font-bold text-[#101828] hover:bg-[#F8F9FA] transition flex items-center justify-center gap-1.5"
            >
              <ArrowUpFromLine size={14} /> Retire
            </button>
          </div>
        </div>

        {/* Notice — subtle, not playful */}
        <p className="text-[10px] text-white/40 text-center -mt-1">
          MonCash ak Natcash ap konfigire. Pou kounye a, depo/retrè se pou tès sèlman.
        </p>

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
                  onClick={() => handleDeposit("moncash")}
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
                  onClick={() => handleDeposit("natcash")}
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

                {/* Demo / test deposit (dev only) */}
                {process.env.NODE_ENV !== "production" && (
                <button
                  onClick={() => handleDeposit("demo")}
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
                )}
              </div>

              <p className="text-[9px] text-[#667085] text-center mb-3">
                ⚠️ MonCash ak Natcash yo ap konfigire. Pou kounye a, sèlman Demo Depo ap mache (dev sèlman).
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

        {/* ═══ TRANSACTIONS — clean statement-style list ═══ */}
        <div>
          <h3 className="text-[10px] font-bold text-white/60 uppercase tracking-widest mb-2 px-1">Istwa tranzaksyon yo</h3>
          {transactions.length === 0 ? (
            <div className="rounded-xl bg-white shadow-sm border border-[#E4E7EC] p-8 text-center">
              <p className="text-xs text-[#667085]">Pa gen tranzaksyon poko.</p>
            </div>
          ) : (
            <div className="rounded-xl bg-white shadow-sm border border-[#E4E7EC] overflow-hidden">
              {transactions.map((t, i) => {
                const meta = TYPE_LABELS[t.type] ?? { label: t.type, color: "text-[#667085]", sign: "" };
                const amount = BigInt(t.amount);
                const isPositive = amount > 0n;
                return (
                  <div
                    key={t.id}
                    className={cn(
                      "px-4 py-3 flex items-center justify-between",
                      i > 0 && "border-t border-[#E4E7EC]",
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-[#101828]">{meta.label}</p>
                      <p className="text-[10px] text-[#667085] mt-0.5">
                        {new Date(t.createdAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}
                      </p>
                    </div>
                    <p className={cn("text-sm font-extrabold tnum shrink-0 ml-3", meta.color)}>
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
