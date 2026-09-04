"use client";

// FIFAYITI SIPÒ — Team Support section.
//
// Shows on the team-detail page. Displays the team's total support,
// supporter count, and a donation flow. Uses the FIFAYITI visual language
// (green/gold, clean, professional — NOT casino-like).

import { useEffect, useState } from "react";
import { Heart, Users, Loader2, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatHtg } from "@/lib/betting/types";

interface SupportStats {
  team: { id: string; name: string; shortName: string };
  totalCentimes: string;
  supporterCount: number;
  recentDonations: {
    amount: string;
    anonymous: boolean;
    donorName: string | null;
    message: string | null;
    createdAt: string;
  }[];
}

const SUPPORT_AMOUNTS = [25, 50, 100, 250, 500];

export function TeamSupportSection({ teamId }: { teamId: string }) {
  const [stats, setStats] = useState<SupportStats | null>(null);
  const [selectedAmount, setSelectedAmount] = useState<number>(100);
  const [donating, setDonating] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const load = async () => {
    try {
      const res = await fetch(`/api/teams/${teamId}/support`, { cache: "no-store" });
      if (res.ok) setStats(await res.json());
    } catch {}
  };

  useEffect(() => {
    load();
    const i = setInterval(load, 30000);
    return () => clearInterval(i);
  }, []);

  const donate = async () => {
    setDonating(true);
    try {
      const res = await fetch(`/api/teams/${teamId}/support/initiate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          amountCentimes: (selectedAmount * 100).toString(),
          provider: "demo",
          anonymous: true,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setToast({ type: "success", msg: "Sipò ou anrejistre! Mèsi." });
        setTimeout(() => setToast(null), 4000);
        load();
      } else {
        setToast({ type: "error", msg: data.error ?? "Erè." });
        setTimeout(() => setToast(null), 4000);
      }
    } catch {
      setToast({ type: "error", msg: "Erè rezo." });
      setTimeout(() => setToast(null), 4000);
    } finally {
      setDonating(false);
    }
  };

  return (
    <div className="rounded-xl bg-white shadow-sm border border-[#E4E7EC] overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3 bg-gradient-to-r from-[#D92D20]/10 to-[#F4C400]/10 border-b border-[#E4E7EC] flex items-center gap-2">
        <Heart size={16} className="text-[#D92D20]" fill="#D92D20" />
        <h3 className="text-sm font-bold text-[#101828]">SIPÒ EKIP LA</h3>
      </div>

      {/* Total support */}
      <div className="px-5 py-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-[10px] font-semibold text-[#667085] uppercase tracking-wider">Total sipò</p>
            <p className="text-2xl font-black text-[#101828] tnum">
              {stats ? formatHtg(stats.totalCentimes) : "0 HTG"}
            </p>
          </div>
          <div className="text-right">
            <div className="flex items-center gap-1.5 justify-end">
              <Users size={12} className="text-[#667085]" />
              <span className="text-[10px] text-[#667085] uppercase tracking-wider">Sipòtè</span>
            </div>
            <p className="text-lg font-bold text-[#101828] tnum">{stats?.supporterCount ?? 0}</p>
          </div>
        </div>

        {/* 0% commission notice */}
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#116B3A]/5 mb-4">
          <span className="text-[9px] font-bold text-[#116B3A]">100% ale nan ekip la · 0% komisyon FIFAYITI</span>
        </div>

        {/* Amount selection */}
        <p className="text-[10px] font-bold text-[#667085] uppercase mb-1.5">Chwazi montan</p>
        <div className="grid grid-cols-5 gap-1.5 mb-3">
          {SUPPORT_AMOUNTS.map((amt) => (
            <button
              key={amt}
              onClick={() => setSelectedAmount(amt)}
              className={cn(
                "py-2 rounded-lg border-2 text-xs font-bold transition",
                selectedAmount === amt
                  ? "border-[#D92D20] bg-[#D92D20]/5 text-[#D92D20]"
                  : "border-[#E4E7EC] text-[#101828] hover:border-[#D92D20]/30"
              )}
            >
              {amt}
            </button>
          ))}
        </div>

        {/* Support button */}
        <button
          onClick={donate}
          disabled={donating}
          className="w-full py-3 rounded-xl bg-[#D92D20] text-white font-bold text-sm hover:brightness-105 transition flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {donating ? (
            <><Loader2 size={15} className="animate-spin" /> N ap trete...</>
          ) : (
            <><Heart size={15} fill="white" /> SIPÒTE {selectedAmount} HTG</>
          )}
        </button>

        {process.env.NODE_ENV !== "production" && (
          <p className="text-[9px] text-[#667085] text-center mt-2">
            Demo: MonCash/Natcash ap konfigire. Tès sèlman.
          </p>
        )}
      </div>

      {/* Recent donations */}
      {stats && stats.recentDonations.length > 0 && (
        <div className="border-t border-[#E4E7EC]">
          <div className="px-5 py-2 bg-[#F8F9FA] border-b border-[#E4E7EC]">
            <p className="text-[9px] font-bold text-[#667085] uppercase tracking-wider">Dènye sipò</p>
          </div>
          <div className="max-h-32 overflow-y-auto">
            {stats.recentDonations.slice(0, 5).map((d, i) => (
              <div key={i} className={cn("px-5 py-2 flex items-center justify-between", i > 0 && "border-t border-[#E4E7EC]")}>
                <div>
                  <p className="text-xs font-bold text-[#101828]">
                    {d.anonymous ? "Sipòtè anonim" : d.donorName ?? "Sipòtè"}
                  </p>
                  {d.message && <p className="text-[10px] text-[#667085] italic">"{d.message}"</p>}
                </div>
                <span className="text-xs font-extrabold text-[#116B3A] tnum">+{formatHtg(d.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50">
          <div className={cn(
            "px-4 py-3 rounded-xl shadow-2xl flex items-center gap-2",
            toast.type === "success" ? "bg-[#116B3A] text-white" : "bg-[#D92D20] text-white"
          )}>
            {toast.type === "success" ? <Check size={15} /> : <X size={15} />}
            <span className="text-sm font-semibold">{toast.msg}</span>
          </div>
        </div>
      )}
    </div>
  );
}
