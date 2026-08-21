"use client";
import { useMemo, useState } from "react";
import { useAppStore } from "@/store/app-store";
import { useToast } from "@/hooks/use-toast";
import {
  Wallet,
  Ticket,
  Users,
  Banknote,
  Smartphone,
  TrendingUp,
  Percent,
  Trophy,
  Info,
  Plus,
  CheckCircle2,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

interface MonCashTx {
  id: string;
  recipient: string;
  phone: string;
  amount: number;
  role: "Genjan" | "Pèdèt";
  status: "Peyi" | "An atant";
  timestamp: string;
}

const HTG = (n: number) => `${n.toLocaleString("fr-FR")} HTG`;

export function FinancesPage() {
  const { adminRole } = useAppStore();
  const { toast } = useToast();

  // Pilot financial model
  const ticketQty = 300;
  const ticketPrice = 100;
  const totalRevenue = ticketQty * ticketPrice; // 30,000 HTG

  const operationalPool = Math.round(totalRevenue * (10000 / 30000)); // 10,000
  const playerPool = totalRevenue - operationalPool; // 20,000

  const winnerShare = Math.round(playerPool * 0.6); // 12,000
  const loserShare = playerPool - winnerShare; // 8,000

  const finalTicketPrice = 250;
  const finalRevenue = 300 * finalTicketPrice; // 75,000

  const [txs, setTxs] = useState<MonCashTx[]>([
    {
      id: "mc-001",
      recipient: "Kapitèn Delmas 31",
      phone: "+509 3700 0001",
      amount: winnerShare,
      role: "Genjan",
      status: "Peyi",
      timestamp: "2026-08-17 22:30",
    },
    {
      id: "mc-002",
      recipient: "Kapitèn Delmas 33",
      phone: "+509 3700 0002",
      amount: loserShare,
      role: "Pèdèt",
      status: "Peyi",
      timestamp: "2026-08-17 22:31",
    },
  ]);

  const payWinner = () => {
    setTxs([
      {
        id: `mc-${Date.now()}`,
        recipient: "Kapitèn Delmas 31",
        phone: "+509 3700 0001",
        amount: winnerShare,
        role: "Genjan",
        status: "Peyi",
        timestamp: new Date().toLocaleString("fr-FR"),
      },
      ...txs,
    ]);
    toast({
      title: "Peman MonCash voye",
      description: `${HTG(winnerShare)} → Kapitèn Delmas 31 (Genjan)`,
    });
  };

  // Allocation progress
  const allocations = [
    {
      label: "Operasyonèl / Arbit",
      amount: operationalPool,
      pct: (operationalPool / totalRevenue) * 100,
      color: "#116B3A",
    },
    {
      label: "Pool Jwè",
      amount: playerPool,
      pct: (playerPool / totalRevenue) * 100,
      color: "#F4C400",
    },
  ];

  const playerSplit = [
    {
      label: "Genjan (60%)",
      amount: winnerShare,
      pct: 60,
      color: "#116B3A",
      fg: "#FFFFFF",
    },
    {
      label: "Pèdèt (40%)",
      amount: loserShare,
      pct: 40,
      color: "#084C2A",
      fg: "#FFFFFF",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <section className="fifayiti-card p-4 md:p-5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#084C2A] flex items-center justify-center shrink-0">
            <Wallet size={20} className="text-[#F4C400]" />
          </div>
          <div className="flex-1">
            <p className="eyebrow text-[#667085] mb-1">Modèl finansye</p>
            <h2 className="heading-lg text-[#084C2A]">
              Modèl finansye pilot FIFAYITI
            </h2>
            <p className="body-sm text-[#667085] mt-1">
              Sistèm la senp: tikè fizik + MonCash pou peman jwè yo. Pa gen
              enfrastrikti peman konplèks.
            </p>
          </div>
        </div>
      </section>

      {/* Revenue cards */}
      <section className="grid md:grid-cols-3 gap-4">
        <RevenueCard
          title="Revni total match"
          subtitle={`${ticketQty} tikè × ${ticketPrice} HTG`}
          amount={totalRevenue}
          tone="#116B3A"
          icon={<Ticket size={18} />}
        />
        <RevenueCard
          title="Pool operasyonèl / arbit"
          subtitle="33% — refere, komisyon, operasyon"
          amount={operationalPool}
          tone="#084C2A"
          icon={<Banknote size={18} />}
        />
        <RevenueCard
          title="Pool jwè"
          subtitle="67% — 60% genjan / 40% pèdèt"
          amount={playerPool}
          tone="#F4C400"
          fg="#084C2A"
          icon={<Users size={18} />}
        />
      </section>

      {/* Allocation bar chart */}
      <section className="fifayiti-card p-4 md:p-5">
        <div className="flex items-center gap-2 mb-4">
          <Percent size={16} className="text-[#116B3A]" />
          <h3 className="heading-md text-[#084C2A]">
            Repatrisyon revni
          </h3>
        </div>
        <div className="space-y-4">
          {allocations.map((a) => (
            <div key={a.label}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="body-sm font-bold text-[#101828]">
                  {a.label}
                </span>
                <span className="body-sm font-bold text-[#101828] tnum">
                  {HTG(a.amount)} · <span className="tnum">{a.pct.toFixed(0)}%</span>
                </span>
              </div>
              <div className="h-3 rounded-full bg-[#F4F7F3] overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${a.pct}%`,
                    background: a.color,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Player pool split */}
      <section className="fifayiti-card p-4 md:p-5" style={{ borderColor: "#F4C400", background: "rgba(244,196,0,0.10)" }}>
        <div className="flex items-center gap-2 mb-4">
          <Trophy size={16} className="text-[#084C2A]" />
          <h3 className="heading-md text-[#084C2A]">
            Pool jwè — pou chak match
          </h3>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          {playerSplit.map((p) => (
            <div
              key={p.label}
              className="rounded-xl p-4 border"
              style={{ background: p.color, color: p.fg, borderColor: p.color }}
            >
              <p className="eyebrow opacity-80">
                {p.label}
              </p>
              <p className="heading-lg tnum mt-1">
                {HTG(p.amount)}
              </p>
              <div className="mt-3 h-2 rounded-full bg-white/20 overflow-hidden">
                <div
                  className="h-full rounded-full bg-white"
                  style={{ width: `${p.pct}%` }}
                />
              </div>
              <p className="mt-2 meta opacity-90">
                Peman: <strong>MonCash</strong> ·rekipe nan telefòn kapitèn
              </p>
            </div>
          ))}
        </div>
        <div className="mt-4 pt-4 border-t border-[#F4C400]/40 flex items-center justify-between gap-3">
          <p className="body-sm text-[#667085] inline-flex items-center gap-1.5">
            <Smartphone size={14} className="text-[#116B3A]" />
            Peman MonCash — peman òtomatik pou kapitèn yo
          </p>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button
                disabled={adminRole !== "president" && adminRole !== "director"}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-[10px] eyebrow disabled:opacity-50"
                style={{ background: "#116B3A", color: "#FFFFFF", minHeight: 36 }}
              >
                <Plus size={12} /> Peye genjan
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Voye peman MonCash?</AlertDialogTitle>
                <AlertDialogDescription>
                  Ou ap peye <strong className="text-[#084C2A]">{HTG(winnerShare)}</strong>{" "}
                  ak Kapitèn Delmas 31 (Genjan) atravè MonCash.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Anile</AlertDialogCancel>
                <AlertDialogAction
                  onClick={payWinner}
                  className="bg-[#116B3A] text-white hover:bg-[#0a5a30]"
                >
                  <Smartphone size={14} /> Konfime peman
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </section>

      {/* Final callout */}
      <section className="fifayiti-card border-2 p-4 md:p-5" style={{ borderColor: "#F4C400", background: "linear-gradient(135deg, rgba(244,196,0,0.15), rgba(17,107,58,0.05))" }}>
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-2xl bg-[#F4C400] flex items-center justify-center shrink-0">
            <Trophy size={22} className="text-[#084C2A]" />
          </div>
          <div className="flex-1">
            <p className="eyebrow text-[#667085]">
              Final — Match pou koup la
            </p>
            <h3 className="heading-lg text-[#084C2A] mt-0.5">
              Tikè Final: 250 HTG
            </h3>
            <p className="body-sm text-[#101828] mt-1 leading-relaxed">
              Finals se yon evènman ki gen pi gwo anviwònman, plis tan pou fanatik,
              prezantasyon pwen. Tikè a pi chè — 250 HTG — paske precedans, prime
              ak kout pwen pi gwo.
            </p>
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
              <MiniStat label="Pou tikè" value="250 HTG" />
              <MiniStat label="Revni Final" value={HTG(finalRevenue)} />
              <MiniStat label="Pool jwè" value={HTG(Math.round((finalRevenue * 2) / 3))} />
              <MiniStat label="Operasyonèl" value={HTG(Math.round(finalRevenue / 3))} />
            </div>
          </div>
        </div>
      </section>

      {/* MonCash transactions log */}
      <section className="fifayiti-card overflow-hidden">
        <div className="px-4 md:px-5 py-4 border-b border-[#E4E7EC] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#116B3A] flex items-center justify-center">
              <Smartphone size={16} className="text-white" />
            </div>
            <div>
              <p className="eyebrow text-[#667085]">Audit trail</p>
              <h3 className="heading-md text-[#084C2A]">
                Jounal MonCash
              </h3>
              <p className="meta text-[#667085]">
                tout peman jwè yo — MonCash òtomatik
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md eyebrow bg-[#116B3A]/10 text-[#116B3A]">
            <CheckCircle2 size={12} /> <span className="tnum">{txs.filter((t) => t.status === "Peyi").length}</span> Peyi
          </span>
        </div>
        <div className="overflow-x-auto max-h-80 overflow-y-auto">
          <table className="w-full body-sm">
            <thead className="sticky top-0 bg-[#F4F7F3]">
              <tr className="eyebrow text-[#667085]">
                <th className="py-2 px-3 text-left">Destinatè</th>
                <th className="py-2 px-3 text-left hidden md:table-cell">Telefòn</th>
                <th className="py-2 px-3 text-left">Wòl</th>
                <th className="py-2 px-3 text-right">Montan</th>
                <th className="py-2 px-3 text-left hidden lg:table-cell">Dat</th>
                <th className="py-2 px-3 text-left">Estati</th>
              </tr>
            </thead>
            <tbody>
              {txs.map((t) => (
                <tr
                  key={t.id}
                  className="border-t border-[#E4E7EC] hover:bg-[#F4F7F3]"
                >
                  <td className="py-2.5 px-3 font-bold text-[#101828]">
                    {t.recipient}
                  </td>
                  <td className="py-2.5 px-3 hidden md:table-cell text-[#667085] font-mono meta">
                    {t.phone}
                  </td>
                  <td className="py-2.5 px-3">
                    <span
                      className="inline-flex items-center px-2 py-0.5 rounded-md eyebrow"
                      style={{
                        background: t.role === "Genjan" ? "#116B3A" : "#084C2A",
                        color: "#FFFFFF",
                      }}
                    >
                      {t.role}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-right font-extrabold text-[#101828] tnum">
                    {HTG(t.amount)}
                  </td>
                  <td className="py-2.5 px-3 hidden lg:table-cell meta text-[#667085]">
                    {t.timestamp}
                  </td>
                  <td className="py-2.5 px-3">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 px-2 py-0.5 rounded-md eyebrow",
                        t.status === "Peyi"
                          ? "bg-[#116B3A] text-white"
                          : "bg-[#F4C400] text-[#084C2A]"
                      )}
                    >
                      {t.status === "Peyi" && <CheckCircle2 size={10} />}
                      {t.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Ticket sales note */}
      <section className="fifayiti-card bg-[#F4F7F3] p-4 md:p-5 flex items-start gap-3">
        <Info size={18} className="text-[#116B3A] shrink-0 mt-0.5" />
        <div className="meta text-[#667085] leading-relaxed">
          <p className="font-bold text-[#084C2A]">Acha tikè — Fizik</p>
          <p className="mt-1">
            Pilot la sèlman vann tikè fizik — pa gen e-commerce ni kat kredi.
            Sa a senplifye pou ekip lokasyon yo. Sistèm la kapab elaji avèk
            peman sou entènèt pita.
          </p>
          <p className="mt-2 inline-flex items-center gap-1.5">
            <TrendingUp size={12} className="text-[#116B3A]" />
            Modèl eskalab: 6 ekip pilot → 30+ ekip, revni pwoporsyonèl.
          </p>
        </div>
      </section>
    </div>
  );
}

function RevenueCard({
  title,
  subtitle,
  amount,
  tone,
  fg = "#FFFFFF",
  icon,
}: {
  title: string;
  subtitle: string;
  amount: number;
  tone: string;
  fg?: string;
  icon: React.ReactNode;
}) {
  return (
    <div
      className="fifayiti-card p-4 md:p-5"
      style={{ background: tone, color: fg, borderColor: tone }}
    >
      <div className="flex items-center justify-between">
        <div className="opacity-90">{icon}</div>
        <span className="eyebrow opacity-80">
          HTG
        </span>
      </div>
      <p className="mt-3 heading-lg tnum">
        {amount.toLocaleString("fr-FR")}
      </p>
      <p className="mt-1 body-sm font-bold opacity-90">{title}</p>
      <p className="meta opacity-80 mt-0.5">{subtitle}</p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white/80 border border-[#E4E7EC] p-2">
      <p className="eyebrow text-[#667085]">
        {label}
      </p>
      <p className="body-sm font-extrabold text-[#101828] tnum">{value}</p>
    </div>
  );
}
