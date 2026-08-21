"use client";
import { useMemo, useState } from "react";
import { useAppStore } from "@/store/app-store";
import { useToast } from "@/hooks/use-toast";
import {
  MATCHES,
  teamById,
  pendingApprovalMatches,
  formatKickoff,
  type Match,
  type MatchStatus,
} from "@/lib/fifayiti-data";
import {
  recordAudit,
  useAuditLog,
  type AuditAction,
  type AuditRecord,
} from "@/lib/audit/audit-log";
import { TeamCrest } from "../team-crest";
import {
  CalendarClock,
  CheckCircle2,
  X,
  Clock,
  MapPin,
  User,
  ShieldCheck,
  Crown,
  Megaphone,
  History,
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

/** Map an audit action to the Creole label shown in the audit UI. */
function auditActionLabel(action: AuditAction): string {
  return {
    "schedule.approve": "Apwouve",
    "schedule.refuse": "Refize",
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

/** Format the audit record timestamp as HH:MM:SS for display. */
function formatAuditTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function SchedulePage() {
  const { adminRole } = useAppStore();
  const { toast } = useToast();
  const [localStatus, setLocalStatus] = useState<Record<string, MatchStatus>>(
    () => {
      const m: Record<string, MatchStatus> = {};
      MATCHES.forEach((mt) => (m[mt.id] = mt.status));
      return m;
    }
  );
  // Audit log now sourced from the centralized in-memory store (pilot) / API (prod).
  const auditRecords = useAuditLog({ targetType: "schedule" });

  const approved = useMemo<Match[]>(
    () => MATCHES.filter((m) => localStatus[m.id] === "PWOGRAM"),
    [localStatus]
  );
  const pending = useMemo<Match[]>(
    () => MATCHES.filter((m) => localStatus[m.id] === "AN_ATANT_APWOVASYON"),
    [localStatus]
  );
  const postponed = useMemo<Match[]>(
    () => MATCHES.filter((m) => localStatus[m.id] === "REPORETE"),
    [localStatus]
  );

  // Note: pendingApprovalMatches() reads from the global template — used only
  // to size the initial pending bucket on first render. After that, local state
  // drives the actual lists so approve/refuse actions reflect immediately.
  void pendingApprovalMatches();

  const approve = (m: Match) => {
    setLocalStatus({ ...localStatus, [m.id]: "PWOGRAM" });
    pushAudit(m, "schedule.approve");
    toast({
      title: "Orè apwouve",
      description: `${teamById(m.homeTeamId)?.shortName} vs ${
        teamById(m.awayTeamId)?.shortName
      } — pwogram ofisyèl.`,
    });
  };

  const refuse = (m: Match) => {
    setLocalStatus({ ...localStatus, [m.id]: "REPORETE" });
    pushAudit(m, "schedule.refuse");
    toast({
      title: "Orè refize / repote",
      description: `${teamById(m.homeTeamId)?.shortName} vs ${
        teamById(m.awayTeamId)?.shortName
      } — repote.`,
      variant: "destructive",
    });
  };

  const pushAudit = (m: Match, action: AuditAction) => {
    const prevStatus = localStatus[m.id];
    recordAudit({
      actor: adminRole,
      action,
      target: m.id,
      targetType: "schedule",
      previousState: prevStatus,
      newState: action === "schedule.approve" ? "PWOGRAM" : "REPORETE",
    });
  };

  return (
    <div className="space-y-6">
      {/* Header with president chip */}
      <section className="fifayiti-card p-4 md:p-5" style={{ borderColor: "#F4C400", background: "rgba(244,196,0,0.10)" }}>
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#F4C400] flex items-center justify-center shrink-0">
            <Crown size={20} className="text-[#084C2A]" />
          </div>
          <div className="flex-1">
            <p className="eyebrow text-[#667085] mb-1">Apwovasyon Prezidan</p>
            <h2 className="heading-lg text-[#084C2A]">
              Orè Konpetisyon — apwovazon Prezidan obligatwa
            </h2>
            <p className="body-sm text-[#667085] mt-1">
              Direktè Konpetisyon pwograme, Prezidan apwouve — tout orè
              ofisyèl pase pa Prezidan.
            </p>
          </div>
          <span
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md eyebrow"
            style={{
              background:
                adminRole === "president" ? "#116B3A" : "#E4E7EC",
              color: adminRole === "president" ? "#FFFFFF" : "#667085",
            }}
          >
            <Crown size={12} />
            {adminRole === "president" ? "Prezidan" : "Mwod ou"}
          </span>
        </div>
      </section>

      {/* KPIs */}
      <section className="grid grid-cols-3 gap-3">
        <KPI label="Pwogram ofisyèl" value={approved.length} tone="#116B3A" icon={<CalendarClock size={14} />} />
        <KPI label="An atant apwovasyon" value={pending.length} tone="#F4C400" fg="#084C2A" icon={<Clock size={14} />} />
        <KPI label="Reporete" value={postponed.length} tone="#D92D20" icon={<X size={14} />} />
      </section>

      {/* Three columns */}
      <section className="grid lg:grid-cols-3 gap-4">
        {/* Approved */}
        <Column
          title="Pwogram ofisyèl"
          subtitle="Apwouve pa Prezidan"
          tone="#116B3A"
          icon={<CheckCircle2 size={14} />}
          empty="Pa gen match ofisyèl anko"
        >
          {approved.map((m) => (
            <MatchRow key={m.id} m={m} tone="green" />
          ))}
        </Column>

        {/* Pending */}
        <Column
          title="An atant apwovasyon"
          subtitle="Apwovasyon Prezidan mande"
          tone="#F4C400"
          icon={<Clock size={14} />}
          empty="Pa gen match an atant"
        >
          {pending.map((m) => (
            <PendingMatchRow
              key={m.id}
              m={m}
              canApprove={adminRole === "president"}
              onApprove={() => approve(m)}
              onRefuse={() => refuse(m)}
            />
          ))}
        </Column>

        {/* Postponed */}
        <Column
          title="Reporete"
          subtitle="Match repote oswa refize"
          tone="#D92D20"
          icon={<X size={14} />}
          empty="Pa gen match repote"
        >
          {postponed.map((m) => (
            <MatchRow key={m.id} m={m} tone="red" />
          ))}
        </Column>
      </section>

      {/* Audit + governance */}
      <div className="grid lg:grid-cols-[1fr_1fr] gap-4">
        <section className="fifayiti-card overflow-hidden">
          <div className="px-4 md:px-5 py-4 border-b border-[#E4E7EC] flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#084C2A] flex items-center justify-center">
              <History size={16} className="text-[#F4C400]" />
            </div>
            <div>
              <p className="eyebrow text-[#667085]">Audit trail</p>
              <h3 className="heading-md text-[#084C2A]">
                Jounal apwovasyon
              </h3>
              <p className="meta text-[#667085]">
                tout apwovasyon ak refi nan sesyon sa a.
              </p>
            </div>
          </div>
          {auditRecords.length === 0 ? (
            <div className="p-6 text-center">
              <p className="body-sm font-bold text-[#101828]">Pa gen aksyon</p>
              <p className="meta text-[#667085] mt-1">
                Apwouve oswa refize yon match pou wè aksyon yo la a.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-[#E4E7EC] max-h-72 overflow-y-auto">
              {auditRecords.map((r: AuditRecord) => {
                const action = auditActionLabel(r.action);
                const m = MATCHES.find((mt) => mt.id === r.target);
                const matchLabel = m
                  ? `${teamById(m.homeTeamId)?.shortName} vs ${
                      teamById(m.awayTeamId)?.shortName
                    }`
                  : r.target;
                return (
                  <li
                    key={r.id}
                    className="px-4 md:px-5 py-2.5 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
                        style={{
                          background:
                            action === "Apwouve" ? "#116B3A" : "#D92D20",
                        }}
                      >
                        {action === "Apwouve" ? (
                          <CheckCircle2 size={12} className="text-white" />
                        ) : (
                          <X size={12} className="text-white" />
                        )}
                      </div>
                      <p className="body-sm font-bold text-[#101828] truncate">
                        {action} — {matchLabel}
                      </p>
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

        <section className="fifayiti-card bg-[#F4F7F3] p-4 md:p-5">
          <div className="flex items-center gap-2 mb-3">
            <ShieldCheck size={18} className="text-[#116B3A]" />
            <h3 className="heading-md text-[#084C2A]">
              Gouvènans orè
            </h3>
          </div>
          <ul className="space-y-2.5 meta text-[#667085]">
            <li className="flex items-start gap-2">
              <Crown size={12} className="text-[#F4C400] mt-0.5 shrink-0" />
              Sèlman Prezidan kapab apwouve oswa refize orè ofisyèl.
            </li>
            <li className="flex items-start gap-2">
              <Megaphone size={12} className="text-[#116B3A] mt-0.5 shrink-0" />
              Direktè Konpetisyon pwograme match yo avan Prezidan apwouve.
            </li>
            <li className="flex items-start gap-2">
              <MapPin size={12} className="text-[#116B3A] mt-0.5 shrink-0" />
              Tout chanjman orè dwe gen rapò ekri — jurisidiction FIFAYITI.
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}

function KPI({
  label,
  value,
  tone,
  fg = "#FFFFFF",
  icon,
}: {
  label: string;
  value: number;
  tone: string;
  fg?: string;
  icon: React.ReactNode;
}) {
  return (
    <div
      className="fifayiti-card p-4"
      style={{ background: tone, borderColor: tone, color: fg }}
    >
      <div className="flex items-center gap-2 opacity-90">{icon}<span className="eyebrow">{label}</span></div>
      <p className="mt-2 heading-lg tnum">{value}</p>
    </div>
  );
}

function Column({
  title,
  subtitle,
  tone,
  icon,
  empty,
  children,
}: {
  title: string;
  subtitle: string;
  tone: string;
  icon: React.ReactNode;
  empty: string;
  children: React.ReactNode;
}) {
  return (
    <div className="fifayiti-card overflow-hidden flex flex-col">
      <div
        className="px-4 py-3 border-b flex items-center justify-between"
        style={{ background: `${tone}10`, borderColor: "#E4E7EC" }}
      >
        <div className="flex items-center gap-2">
          <span
            className="inline-flex items-center justify-center w-7 h-7 rounded-md text-white"
            style={{ background: tone, color: tone === "#F4C400" ? "#084C2A" : "#FFFFFF" }}
          >
            {icon}
          </span>
          <div>
            <p className="body-sm font-extrabold text-[#084C2A]">{title}</p>
            <p className="meta text-[#667085]">{subtitle}</p>
          </div>
        </div>
      </div>
      <div className="p-2 flex-1">
        {Array.isArray(children) && children.length === 0 ? (
          <div className="text-center py-8">
            <CalendarClock size={20} className="mx-auto text-[#E4E7EC]" />
            <p className="meta text-[#667085] mt-1">{empty}</p>
          </div>
        ) : (
          <div className="space-y-2">{children}</div>
        )}
      </div>
    </div>
  );
}

function MatchRow({ m, tone }: { m: Match; tone: "green" | "red" }) {
  const home = teamById(m.homeTeamId)!;
  const away = teamById(m.awayTeamId)!;
  const accent = tone === "green" ? "#116B3A" : "#D92D20";
  return (
    <div className="rounded-xl border border-[#E4E7EC] p-3 bg-white">
      <div className="flex items-center justify-between mb-2">
        <span
          className="inline-flex items-center px-1.5 py-0.5 rounded eyebrow"
          style={{ background: `${accent}15`, color: accent }}
        >
          Group {m.group}
        </span>
        <span className="meta font-bold text-[#084C2A]">
          {formatKickoff(m.kickoff)}
        </span>
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TeamCrest
            teamId={home.id}
            shortName={home.shortName}
            primary={home.primaryColor}
            secondary={home.secondaryColor}
            size="xs"
          />
          <span className="body-sm font-bold text-[#101828]">{home.shortName}</span>
        </div>
        <span className="meta text-[#667085] font-bold">vs</span>
        <div className="flex items-center gap-2">
          <span className="body-sm font-bold text-[#101828]">{away.shortName}</span>
          <TeamCrest
            teamId={away.id}
            shortName={away.shortName}
            primary={away.primaryColor}
            secondary={away.secondaryColor}
            size="xs"
          />
        </div>
      </div>
      <div className="mt-2 pt-2 border-t border-[#E4E7EC] flex items-center gap-3 meta text-[#667085]">
        <span className="inline-flex items-center gap-1">
          <MapPin size={10} /> {m.venue}
        </span>
      </div>
    </div>
  );
}

function PendingMatchRow({
  m,
  canApprove,
  onApprove,
  onRefuse,
}: {
  m: Match;
  canApprove: boolean;
  onApprove: () => void;
  onRefuse: () => void;
}) {
  const home = teamById(m.homeTeamId)!;
  const away = teamById(m.awayTeamId)!;
  return (
    <div className="rounded-xl border-2 border-dashed border-[#F4C400] p-3 bg-[#F4C400]/5">
      <div className="flex items-center justify-between mb-2">
        <span className="inline-flex items-center px-1.5 py-0.5 rounded eyebrow bg-[#F4C400] text-[#084C2A]">
          Group {m.group} · Matchday <span className="tnum ml-0.5">{m.matchday}</span>
        </span>
        <span className="meta font-bold text-[#084C2A]">
          {formatKickoff(m.kickoff)}
        </span>
      </div>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <TeamCrest
            teamId={home.id}
            shortName={home.shortName}
            primary={home.primaryColor}
            secondary={home.secondaryColor}
            size="xs"
          />
          <span className="body-sm font-bold text-[#101828]">{home.shortName}</span>
        </div>
        <span className="meta text-[#667085] font-bold">vs</span>
        <div className="flex items-center gap-2">
          <span className="body-sm font-bold text-[#101828]">{away.shortName}</span>
          <TeamCrest
            teamId={away.id}
            shortName={away.shortName}
            primary={away.primaryColor}
            secondary={away.secondaryColor}
            size="xs"
          />
        </div>
      </div>
      <div className="space-y-1 meta text-[#667085] mb-3">
        <p className="inline-flex items-center gap-1">
          <MapPin size={10} /> {m.venue}
        </p>
        {m.referee && (
          <p className="inline-flex items-center gap-1">
            <Megaphone size={10} /> {m.referee}
          </p>
        )}
        {m.commissioner && (
          <p className="inline-flex items-center gap-1">
            <User size={10} /> {m.commissioner}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button
              disabled={!canApprove}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-[10px] eyebrow disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: "#116B3A", color: "#FFFFFF", minHeight: 36 }}
            >
              <CheckCircle2 size={12} /> Apwouve
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Apwouve orè sa a?</AlertDialogTitle>
              <AlertDialogDescription>
                Ou ap apwouve orè ofisyèl pou{" "}
                <strong className="text-[#084C2A]">{home.name} vs {away.name}</strong>.
                Match a ap vin "Pwogram" epi parèt nan "Pwogram ofisyèl".
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Anile</AlertDialogCancel>
              <AlertDialogAction
                onClick={onApprove}
                className="bg-[#116B3A] text-white hover:bg-[#0a5a30]"
              >
                <CheckCircle2 size={14} /> Konfime apwovasyon
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button
              disabled={!canApprove}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-[10px] eyebrow disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: "#D92D20", color: "#FFFFFF", minHeight: 36 }}
            >
              <X size={12} /> Refize
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Refize orè sa a?</AlertDialogTitle>
              <AlertDialogDescription>
                Ou ap refize orè pou{" "}
                <strong className="text-[#084C2A]">{home.name} vs {away.name}</strong>.
                Match a ap vin "Reporete". Direktè Konpetisyon ap dwe
                pwograme yon nouvo orè.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Anile</AlertDialogCancel>
              <AlertDialogAction
                onClick={onRefuse}
                className="bg-[#D92D20] text-white hover:brightness-110"
              >
                <X size={14} /> Konfime refi
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
      {!canApprove && (
        <p className="mt-2 meta text-[#D92D20] font-bold inline-flex items-center gap-1">
          <Crown size={10} /> Sèlman Prezidan kapab apwouve.
        </p>
      )}
    </div>
  );
}
