"use client";
import { useMemo, useState } from "react";
import { useAppStore } from "@/store/app-store";
import { useToast } from "@/hooks/use-toast";
import {
  PILOT,
  teamById,
  playerById,
  playerStatusLabels,
  playersPendingVerification,
  type Player,
} from "@/lib/fifayiti-data";
import {
  recordAudit,
  useAuditLog,
  type AuditAction,
  type AuditRecord,
} from "@/lib/audit/audit-log";
import {
  CheckCircle2,
  X,
  AlertTriangle,
  Search,
  ShieldCheck,
  History,
  UserCheck,
  UserX,
  RefreshCw,
  Filter,
  Clock,
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

type FilterKey = "TOUT" | Player["status"];

const FILTERS: FilterKey[] = [
  "TOUT",
  "AN_ATANT",
  "VERIFYE",
  "REFIZE",
  "DEMANDE_KOREKSYON",
];

const STATUS_TONE: Record<Player["status"], { bg: string; fg: string }> = {
  AN_ATANT: { bg: "#F4C400", fg: "#084C2A" },
  VERIFYE: { bg: "#116B3A", fg: "#FFFFFF" },
  REFIZE: { bg: "#D92D20", fg: "#FFFFFF" },
  DEMANDE_KOREKSYON: { bg: "#F4C400", fg: "#084C2A" },
};

/** Map an audit action to the Creole label shown in the audit trail UI. */
function auditActionLabel(action: AuditAction): string {
  return {
    "player.verify": "Verifye",
    "player.refuse": "Refize",
    "player.request_correction": "Mande koreksyon",
  }[action] ?? action;
}

/** Map a stored role string to the Creole role label shown in the audit UI. */
function roleLabel(role: string): string {
  return role === "president"
    ? "Prezidan"
    : role === "director"
    ? "Direktè"
    : role === "live_operator"
    ? "Operatè"
    : role === "team_admin"
    ? "Team Admin"
    : role;
}

/** Format the audit record timestamp as HH:MM:SS for display (matches the old local-log format). */
function formatAuditTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function PlayerVerificationPage() {
  const { adminRole } = useAppStore();
  const { toast } = useToast();
  const [localStatus, setLocalStatus] = useState<Record<string, Player["status"]>>(
    () => {
      const m: Record<string, Player["status"]> = {};
      PILOT.players.forEach((p) => (m[p.id] = p.status));
      return m;
    }
  );
  const [filter, setFilter] = useState<FilterKey>("TOUT");
  const [q, setQ] = useState("");
  // Audit log now sourced from the centralized in-memory store (pilot) / API (prod).
  const auditRecords = useAuditLog({ targetType: "player" });

  const playerList = useMemo<Player[]>(() => {
    return [...PILOT.players]
      .filter((p) => p.status === "AN_ATANT" || localStatus[p.id] !== p.status ? true : true)
      .filter((p) => {
        const s = localStatus[p.id] ?? p.status;
        const okStatus = filter === "TOUT" || s === filter;
        const okQ =
          q.trim() === "" ||
          `${p.firstName} ${p.lastName}`.toLowerCase().includes(q.toLowerCase());
        return okStatus && okQ;
      })
      .sort((a, b) => a.lastName.localeCompare(b.lastName));
  }, [localStatus, filter, q]);

  // Show pending first by default — but if user filters, show selected filter
  const pendingCount = playersPendingVerification().length;

  const applyAction = (
    p: Player,
    action: "VERIFYE" | "REFIZE" | "DEMANDE_KOREKSYON"
  ) => {
    const prevStatus = localStatus[p.id];
    setLocalStatus({ ...localStatus, [p.id]: action });
    const team = teamById(p.teamId);
    const label =
      action === "VERIFYE"
        ? "Verifye"
        : action === "REFIZE"
        ? "Refize"
        : "Mande koreksyon";
    // Centralized audit record (pilot: in-memory store; prod: POST /api/audit).
    recordAudit({
      actor: adminRole,
      action:
        action === "VERIFYE"
          ? "player.verify"
          : action === "REFIZE"
          ? "player.refuse"
          : "player.request_correction",
      target: p.id,
      targetType: "player",
      previousState: prevStatus,
      newState: action,
    });
    toast({
      title: `Aksyon: ${label}`,
      description: `${p.firstName} ${p.lastName} (${team?.name ?? ""}) — ${playerStatusLabels(
        prevStatus
      )} → ${playerStatusLabels(action)}`,
    });
  };

  const counts = useMemo(() => {
    const c: Record<string, number> = { TOUT: PILOT.players.length };
    PILOT.players.forEach((p) => {
      const s = localStatus[p.id];
      c[s] = (c[s] ?? 0) + 1;
    });
    return c;
  }, [localStatus]);

  return (
    <div className="space-y-6">
      {/* Header callout */}
      <section className="fifayiti-card p-4 md:p-5" style={{ borderColor: "#116B3A", background: "rgba(17,107,58,0.05)" }}>
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#116B3A] flex items-center justify-center shrink-0">
            <ShieldCheck size={20} className="text-[#F4C400]" />
          </div>
          <div>
            <p className="eyebrow text-[#667085] mb-1">Verifikasyon idantite</p>
            <h2 className="heading-lg text-[#084C2A]">
              Verifikasyon idantite jwè — aksyon konfime
            </h2>
            <p className="body-sm text-[#667085] mt-1">
              Chak modifikasyon (Verifye / Refize / Mande koreksyon) mande
              konfirmasyon ekspresyon. tout aksyon yo enrejistre nan jounal
              audit anba paj la.
            </p>
            <div className="mt-3 flex flex-wrap gap-3">
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-[#F4C400]/20 text-[#084C2A] eyebrow">
                <AlertTriangle size={12} /> <span className="tnum">{pendingCount}</span> an atant
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-[#116B3A]/10 text-[#116B3A] eyebrow">
                <CheckCircle2 size={12} /> <span className="tnum">{counts.VERIFYE ?? 0}</span> verifye
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-[#D92D20]/10 text-[#D92D20] eyebrow">
                <X size={12} /> <span className="tnum">{counts.REFIZE ?? 0}</span> refize
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Filter bar */}
      <section className="fifayiti-card p-4 md:p-5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center gap-3">
          <div className="relative flex-1">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[#667085]"
            />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Chache jwè pa non oswa nimewo mach..."
              className="w-full pl-10 pr-4 py-2.5 rounded-[10px] border border-[#E4E7EC] bg-[#F4F7F3] body-sm text-[#101828] focus:outline-none focus:border-[#116B3A] focus:ring-2 focus:ring-[#116B3A]/10"
              style={{ minHeight: 44 }}
            />
          </div>
          <div className="flex items-center gap-2 eyebrow text-[#667085]">
            <Filter size={14} /> Filtre
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((s) => {
            const isActive = filter === s;
            const label = s === "TOUT" ? "Tout" : playerStatusLabels(s);
            return (
              <button
                key={s}
                onClick={() => setFilter(s)}
                className={cn(
                  "inline-flex items-center gap-2 px-3 py-2 rounded-[10px] body-sm font-bold transition-all",
                  isActive
                    ? "bg-[#084C2A] text-white"
                    : "bg-[#F4F7F3] text-[#667085] hover:bg-[#E4E7EC]"
                )}
                style={{ minHeight: 36 }}
              >
                {label}
                <span
                  className={cn(
                    "inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded eyebrow",
                    isActive ? "bg-[#F4C400] text-[#084C2A]" : "bg-white text-[#667085]"
                  )}
                >
                  <span className="tnum">{counts[s] ?? 0}</span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Players table */}
      <section className="fifayiti-card overflow-hidden">
        <div className="overflow-x-auto max-h-[640px] overflow-y-auto">
          <table className="w-full body-sm">
            <thead className="sticky top-0 bg-[#F4F7F3] z-10">
              <tr className="eyebrow text-[#667085]">
                <th className="py-2.5 px-3 text-left">Foto</th>
                <th className="py-2.5 px-3 text-left">Jwè</th>
                <th className="py-2.5 px-3 text-left hidden md:table-cell">Ekip</th>
                <th className="py-2.5 px-3 text-left">Estati</th>
                <th className="py-2.5 px-3 text-left hidden lg:table-cell">Dat soumèt</th>
                <th className="py-2.5 px-3 text-right">Aksyon</th>
              </tr>
            </thead>
            <tbody>
              {playerList.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center">
                    <p className="body-sm font-bold text-[#101828]">Pa gen jwè</p>
                    <p className="meta text-[#667085] mt-1">
                      Pa gen jwè koresponn ak filtè sa a.
                    </p>
                  </td>
                </tr>
              ) : (
                playerList.map((p) => {
                  const team = teamById(p.teamId)!;
                  const status = localStatus[p.id];
                  const tone = STATUS_TONE[status];
                  return (
                    <tr
                      key={p.id}
                      className="border-t border-[#E4E7EC] hover:bg-[#F4F7F3]"
                    >
                      <td className="py-3 px-3">
                        <div
                          className="w-9 h-9 rounded-full flex items-center justify-center eyebrow text-white"
                          style={{ background: team.primaryColor }}
                        >
                          {p.photo}
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <p className="font-bold text-[#101828]">
                          {p.firstName} {p.lastName}
                        </p>
                        <p className="meta text-[#667085]">
                          <span className="tnum">#{p.jerseyNumber}</span> · {p.idNumber}
                        </p>
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
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md eyebrow"
                          style={{ background: tone.bg, color: tone.fg }}
                        >
                          {playerStatusLabels(status)}
                        </span>
                      </td>
                      <td className="py-3 px-3 hidden lg:table-cell meta text-[#667085]">
                        <span className="inline-flex items-center gap-1">
                          <Clock size={11} /> {p.submittedAt}
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex items-center justify-end gap-2">
                          {/* Verifye */}
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <button
                                disabled={status === "VERIFYE"}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-[10px] eyebrow disabled:opacity-40"
                                style={{
                                  background: "#116B3A",
                                  color: "#FFFFFF",
                                  minHeight: 32,
                                }}
                              >
                                <UserCheck size={12} /> Verifye
                              </button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>
                                  Konfime verifikasyon
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                  Ou ap verifye idantite CIN ak posede pou{" "}
                                  <strong className="text-[#084C2A]">
                                    {p.firstName} {p.lastName}
                                  </strong>{" "}
                                  ({team.name}). Aksyon sa a ap parèt nan jounal
                                  audit.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Anile</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => applyAction(p, "VERIFYE")}
                                  className="bg-[#116B3A] text-white hover:bg-[#0a5a30]"
                                >
                                  <CheckCircle2 size={14} /> Konfime
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>

                          {/* Refize */}
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <button
                                disabled={status === "REFIZE"}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-[10px] eyebrow disabled:opacity-40"
                                style={{
                                  background: "#D92D20",
                                  color: "#FFFFFF",
                                  minHeight: 32,
                                }}
                              >
                                <UserX size={12} /> Refize
                              </button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>
                                  Konfime refi
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                  Ou ap refize verifikasyon pou{" "}
                                  <strong className="text-[#084C2A]">
                                    {p.firstName} {p.lastName}
                                  </strong>
                                  . Team Admin ap resevwa notifikasyon pou
                                  korige dokiman yo.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Anile</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => applyAction(p, "REFIZE")}
                                  className="bg-[#D92D20] text-white hover:brightness-110"
                                >
                                  <X size={14} /> Konfime refi
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>

                          {/* Mande koreksyon */}
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <button
                                disabled={status === "DEMANDE_KOREKSYON"}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-[10px] eyebrow disabled:opacity-40"
                                style={{
                                  background: "#F4C400",
                                  color: "#084C2A",
                                  minHeight: 32,
                                }}
                              >
                                <RefreshCw size={12} /> Koreksyon
                              </button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>
                                  Mande koreksyon
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                  Ou ap mande Team Admin korige enfòmasyon pou{" "}
                                  <strong className="text-[#084C2A]">
                                    {p.firstName} {p.lastName}
                                  </strong>
                                  . Estati a ap chanje nan "Mande koreksyon".
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Anile</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() =>
                                    applyAction(p, "DEMANDE_KOREKSYON")
                                  }
                                  className="bg-[#084C2A] text-white hover:brightness-110"
                                >
                                  <RefreshCw size={14} /> Konfime demann
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Audit trail */}
      <section className="fifayiti-card overflow-hidden">
        <div className="px-4 md:px-5 py-4 border-b border-[#E4E7EC] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#084C2A] flex items-center justify-center">
              <History size={16} className="text-[#F4C400]" />
            </div>
            <div>
              <p className="eyebrow text-[#667085] mb-1">Audit trail</p>
              <h3 className="heading-md text-[#084C2A]">
                Jounal audit sesyon
              </h3>
              <p className="meta text-[#667085]">
                tout aksyon konfime yo nan sesyon sa a.
              </p>
            </div>
          </div>
          <span
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md eyebrow"
            style={{
              background: auditRecords.length > 0 ? "#116B3A" : "#E4E7EC",
              color: auditRecords.length > 0 ? "#FFFFFF" : "#667085",
            }}
          >
            <span className="tnum">{auditRecords.length}</span> aksyon
          </span>
        </div>
        {auditRecords.length === 0 ? (
          <div className="p-8 text-center">
            <History size={24} className="mx-auto text-[#E4E7EC]" />
            <p className="mt-2 body-sm font-bold text-[#101828]">
              Pa gen aksyon anko
            </p>
            <p className="meta text-[#667085] mt-1">
              Lè w ap verifye, refize oswa mande koreksyon, aksyon yo ap
              parèt la a.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-[#E4E7EC] max-h-80 overflow-y-auto">
            {auditRecords.map((r: AuditRecord) => {
              const action = auditActionLabel(r.action);
              const player = playerById(r.target);
              const playerName = player
                ? `${player.firstName} ${player.lastName}`
                : r.target;
              return (
                <li
                  key={r.id}
                  className="px-4 md:px-5 py-3 flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                      style={{
                        background:
                          action === "Verifye"
                            ? "#116B3A"
                            : action === "Refize"
                            ? "#D92D20"
                            : "#F4C400",
                      }}
                    >
                      {action === "Verifye" ? (
                        <CheckCircle2 size={14} className="text-white" />
                      ) : action === "Refize" ? (
                        <X size={14} className="text-white" />
                      ) : (
                        <RefreshCw size={14} className="text-[#084C2A]" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="body-sm font-bold text-[#101828] truncate">
                        {action} — {playerName}
                      </p>
                      <p className="meta text-[#667085]">
                        {r.target} · {roleLabel(r.actor)}
                      </p>
                    </div>
                  </div>
                  <span className="meta text-[#667085] font-mono shrink-0 tnum">
                    {formatAuditTime(r.timestamp)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
