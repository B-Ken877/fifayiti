"use client";
import { useMemo, useState } from "react";
import { useAppStore } from "@/store/app-store";
import {
  PILOT,
  MATCHES,
  teamById,
  playerById,
  matchById,
  type Player,
} from "@/lib/fifayiti-data";
import {
  ScrollText,
  Square,
  SquareArrowUp,
  Filter,
  Ban,
  ChevronRight,
  Calendar,
  AlertTriangle,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";

type KindFilter = "TOUT" | "JON" | "WOUJ";

interface CardRow {
  id: string;
  player: Player;
  teamId: string;
  matchId: string;
  minute: number;
  kind: "JON" | "WOUJ";
}

export function DisciplinePage() {
  const { setActiveMatchId, setView } = useAppStore();
  const [teamFilter, setTeamFilter] = useState<string>("TOUT");
  const [kindFilter, setKindFilter] = useState<KindFilter>("TOUT");

  // Cards are derived ENTIRELY from match events (single source of truth).
  // No duplicate hard-coded entries — every card shown corresponds to a real
  // KAT_JON / KAT_WOUJ event recorded by an operator.
  const cards = useMemo<CardRow[]>(() => {
    const rows: CardRow[] = [];
    MATCHES.forEach((m) => {
      m.events.forEach((e) => {
        if (e.kind !== "KAT_JON" && e.kind !== "KAT_WOUJ") return;
        if (e.correctedFrom) return; // corrected/voided cards do not count
        const p = e.playerInId ? playerById(e.playerInId) : undefined;
        if (p && e.teamId) {
          rows.push({
            id: e.id,
            player: p,
            teamId: e.teamId,
            matchId: m.id,
            minute: e.minute,
            kind: e.kind === "KAT_JON" ? "JON" : "WOUJ",
          });
        }
      });
    });
    return rows;
  }, []);

  const filtered = useMemo(() => {
    return cards.filter((c) => {
      const okTeam = teamFilter === "TOUT" || c.teamId === teamFilter;
      const okKind = kindFilter === "TOUT" || c.kind === kindFilter;
      return okTeam && okKind;
    });
  }, [cards, teamFilter, kindFilter]);

  // Suspended: red card OR 2 yellows in competition
  const suspended = useMemo(() => {
    const map = new Map<
      string,
      { player: Player; reason: string; teamId: string }
    >();
    cards.forEach((c) => {
      if (c.kind === "WOUJ") {
        if (!map.has(c.player.id)) {
          map.set(c.player.id, {
            player: c.player,
            reason: "Kat wouj — suspendu otomatik",
            teamId: c.teamId,
          });
        }
      }
    });
    // yellows per team per player
    const yellowCount = new Map<string, number>();
    cards.forEach((c) => {
      if (c.kind === "JON") {
        const key = `${c.player.id}`;
        yellowCount.set(key, (yellowCount.get(key) ?? 0) + 1);
      }
    });
    yellowCount.forEach((count, pid) => {
      const p = playerById(pid);
      if (p && count >= 2 && !map.has(pid)) {
        map.set(pid, {
          player: p,
          reason: `2 kat jòn — otomatik (${
            count
          } nan konpetisyon)`,
          teamId: p.teamId,
        });
      }
    });
    return Array.from(map.values());
  }, [cards]);

  const jonCount = cards.filter((c) => c.kind === "JON").length;
  const woujCount = cards.filter((c) => c.kind === "WOUJ").length;

  const openMatch = (id: string) => {
    setActiveMatchId(id);
    setView("admin-match-control");
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <section className="fifayiti-card p-4 md:p-5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#D92D20] flex items-center justify-center shrink-0">
            <ScrollText size={20} className="text-white" />
          </div>
          <div className="flex-1">
            <p className="eyebrow text-[#667085] mb-1">Komisyon Disiplin FIFAYITI</p>
            <h2 className="heading-lg text-[#084C2A]">
              Disiplin — kat jòn ak kat wouj
            </h2>
            <p className="body-sm text-[#667085] mt-1">
              tout kat nan konpetisyon FIFAYITI Koup Tikan 2026. Jwè ak 2 kat jòn
              oswa 1 kat wouj otomatikman suspendu.
            </p>
          </div>
          <span className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md eyebrow bg-[#D92D20] text-white">
            <Ban size={12} /> <span className="tnum">{suspended.length}</span> suspendu
          </span>
        </div>
      </section>

      {/* KPIs */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI label="Total kat" value={cards.length} tone="#084C2A" />
        <KPI label="Kat jòn" value={jonCount} tone="#F4C400" fg="#084C2A" />
        <KPI label="Kat wouj" value={woujCount} tone="#D92D20" />
        <KPI label="Jwè suspendu" value={suspended.length} tone="#084C2A" />
      </section>

      {/* Filters */}
      <section className="fifayiti-card p-4 md:p-5">
        <div className="flex items-center gap-2 eyebrow text-[#667085] mb-3">
          <Filter size={14} /> Filtre
        </div>
        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <label className="block eyebrow text-[#667085] mb-1.5">
              Pa ekip
            </label>
            <select
              value={teamFilter}
              onChange={(e) => setTeamFilter(e.target.value)}
              className="w-full px-3 py-2.5 rounded-[10px] border border-[#E4E7EC] bg-[#F4F7F3] body-sm text-[#101828]"
              style={{ minHeight: 44 }}
            >
              <option value="TOUT">Tout ekip</option>
              {PILOT.teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block eyebrow text-[#667085] mb-1.5">
              Pa tip
            </label>
            <div className="flex gap-2">
              {(["TOUT", "JON", "WOUJ"] as KindFilter[]).map((k) => (
                <button
                  key={k}
                  onClick={() => setKindFilter(k)}
                  className={cn(
                    "flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-[10px] body-sm font-bold transition-all",
                    kindFilter === k
                      ? "bg-[#084C2A] text-white"
                      : "bg-[#F4F7F3] text-[#667085] hover:bg-[#E4E7EC]"
                  )}
                  style={{ minHeight: 44 }}
                >
                  {k === "TOUT" ? (
                    "Tout"
                  ) : k === "JON" ? (
                    <>
                      <Square size={12} /> Kat jòn
                    </>
                  ) : (
                    <>
                      <SquareArrowUp size={12} /> Kat wouj
                    </>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Suspended players */}
      <section className="fifayiti-card p-4 md:p-5" style={{ borderColor: "#D92D20", background: "rgba(217,45,32,0.05)" }}>
        <div className="flex items-center gap-2 mb-3">
          <Ban size={18} className="text-[#D92D20]" />
          <h3 className="heading-md text-[#084C2A]">
            Jwè otomatikman suspendu (<span className="tnum">{suspended.length}</span>)
          </h3>
        </div>
        {suspended.length === 0 ? (
          <div className="text-center py-6">
            <ShieldCheck size={24} className="mx-auto text-[#116B3A]" />
            <p className="mt-2 body-sm font-bold text-[#101828]">
              Pa gen jwè suspendu
            </p>
            <p className="meta text-[#667085] mt-1">
              tout jwè kapab jwe — pa gen disiplin ajoute.
            </p>
          </div>
        ) : (
          <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {suspended.map((s) => {
              const team = teamById(s.teamId);
              return (
                <li
                  key={s.player.id}
                  className="rounded-xl bg-white border border-[#E4E7EC] p-3"
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center eyebrow text-white"
                      style={{ background: team?.primaryColor }}
                    >
                      {s.player.photo}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="body-sm font-bold text-[#101828] truncate">
                        {s.player.firstName} {s.player.lastName}
                      </p>
                      <p className="meta text-[#667085]">
                        <span className="tnum">#{s.player.jerseyNumber}</span> · {team?.shortName}
                      </p>
                    </div>
                    <Ban size={14} className="text-[#D92D20]" />
                  </div>
                  <p className="mt-2 meta text-[#D92D20] font-bold">
                    {s.reason}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Cards table */}
      <section className="fifayiti-card overflow-hidden">
        <div className="px-4 md:px-5 py-4 border-b border-[#E4E7EC] flex items-center gap-2">
          <ScrollText size={16} className="text-[#116B3A]" />
          <h3 className="heading-md text-[#084C2A]">
            Tout kat (<span className="tnum">{filtered.length}</span>)
          </h3>
        </div>
        {filtered.length === 0 ? (
          <div className="p-8 text-center">
            <ShieldCheck size={28} className="mx-auto text-[#E4E7EC]" />
            <p className="mt-2 body-sm font-bold text-[#101828]">
              Pa gen kat nan filtre sa a
            </p>
            <p className="meta text-[#667085] mt-1">
              Eseye yon lòt filtre oswa montre tout kat yo.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
            <table className="w-full body-sm">
              <thead className="sticky top-0 bg-[#F4F7F3] z-10">
                <tr className="eyebrow text-[#667085]">
                  <th className="py-2.5 px-3 text-left">Jwè</th>
                  <th className="py-2.5 px-3 text-left hidden md:table-cell">Ekip</th>
                  <th className="py-2.5 px-3 text-left">Tip</th>
                  <th className="py-2.5 px-3 text-left hidden lg:table-cell">Match</th>
                  <th className="py-2.5 px-3 text-left">Minit</th>
                  <th className="py-2.5 px-3 text-right">Aksyon</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => {
                  const team = teamById(c.teamId)!;
                  const m = matchById(c.matchId);
                  return (
                    <tr
                      key={c.id}
                      className="border-t border-[#E4E7EC] hover:bg-[#F4F7F3]"
                    >
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-7 h-7 rounded-full flex items-center justify-center eyebrow text-white"
                            style={{ background: team.primaryColor }}
                          >
                            {c.player.photo}
                          </div>
                          <div>
                            <p className="font-bold text-[#101828]">
                              {c.player.firstName} {c.player.lastName}
                            </p>
                            <p className="meta text-[#667085]">
                              #{c.player.jerseyNumber}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-3 hidden md:table-cell">
                        <span className="inline-flex items-center gap-1.5">
                          <span
                            className="w-2.5 h-2.5 rounded-full"
                            style={{ background: team.primaryColor }}
                          />
                          <span className="body-sm font-bold text-[#101828]">
                            {team.shortName}
                          </span>
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        {c.kind === "JON" ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md eyebrow bg-[#F4C400] text-[#084C2A]">
                            <Square size={10} /> Kat jòn
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md eyebrow bg-[#D92D20] text-white">
                            <SquareArrowUp size={10} /> Kat wouj
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 hidden lg:table-cell meta text-[#667085]">
                        {m ? (
                          <span className="inline-flex items-center gap-1">
                            <Calendar size={10} />
                            {teamById(m.homeTeamId)?.shortName} vs {teamById(m.awayTeamId)?.shortName}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="py-3 px-3 body-sm font-bold text-[#101828] tnum">
                        {c.minute}'
                      </td>
                      <td className="py-3 px-3 text-right">
                        <button
                          onClick={() => openMatch(c.matchId)}
                          className="inline-flex items-center gap-1 px-2 py-1.5 rounded-md eyebrow bg-[#116B3A]/10 text-[#116B3A] hover:bg-[#116B3A]/20"
                          style={{ minHeight: 32 }}
                        >
                          Detay <ChevronRight size={11} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Disclaimer */}
      <section className="rounded-2xl border border-[#F4C400] bg-[#F4C400]/10 p-4 md:p-5 flex items-start gap-3">
        <AlertTriangle size={18} className="text-[#084C2A] shrink-0 mt-0.5" />
        <p className="meta text-[#667085] leading-relaxed">
          <strong className="text-[#084C2A]">Sistèm otomatik:</strong> 2 kat
          jòn = 1 match suspendu. 1 kat wouj = 1 match suspendu. Kat jòn
          resete apre fen konpetisyon. Kat wouj ap envestige pa
          Komisyon Disiplin FIFAYITI.
        </p>
      </section>
    </div>
  );
}

function KPI({
  label,
  value,
  tone,
  fg = "#FFFFFF",
}: {
  label: string;
  value: number;
  tone: string;
  fg?: string;
}) {
  return (
    <div
      className="fifayiti-card p-4"
      style={{ background: tone, borderColor: tone, color: fg }}
    >
      <p className="heading-lg tnum">{value}</p>
      <p className="mt-1 eyebrow opacity-80">
        {label}
      </p>
    </div>
  );
}
