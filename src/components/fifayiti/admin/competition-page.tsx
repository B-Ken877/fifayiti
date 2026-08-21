"use client";
import { useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import {
  Trophy, Plus, X, Save, Trash2, RefreshCw, Calendar, Users,
  ChevronRight, Crown, Settings, AlertTriangle, CheckCircle2, ListChecks,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface TeamData {
  id: string;
  name: string;
  shortName: string;
  primaryColor: string;
  secondaryColor: string;
  logoUrl?: string | null;
}

interface GroupData {
  id: string;
  name: string;
  teams: Array<{ teamId: string; team: TeamData; seedNumber: number }>;
}

interface MatchData {
  id: string;
  matchday: number;
  stage: string;
  groupLabel?: string | null;
  bracketSlot?: string | null;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
  kickoff: string;
  status: string;
}

interface CompetitionData {
  id: string;
  name: string;
  slug: string;
  season: string;
  status: string;
  format: string;
  rrType: string;
  groupCount: number;
  teamsPerGroup: number;
  qualifiersPerGroup: number;
  hasThirdPlaceMatch: boolean;
  hasKnockoutPhase: boolean;
  startDate?: string | null;
  endDate?: string | null;
  groups?: GroupData[];
  matches?: MatchData[];
  _count?: { matches: number; registrations: number };
}

interface CreateForm {
  name: string;
  season: string;
  groupCount: number;
  teamsPerGroup: number;
  qualifiersPerGroup: number;
  rrType: "SINGLE" | "DOUBLE";
  hasKnockoutPhase: boolean;
  hasThirdPlaceMatch: boolean;
  startDate: string;
  endDate: string;
}

const EMPTY_FORM: CreateForm = {
  name: "",
  season: String(new Date().getFullYear()),
  groupCount: 2,
  teamsPerGroup: 4,
  qualifiersPerGroup: 2,
  rrType: "SINGLE",
  hasKnockoutPhase: true,
  hasThirdPlaceMatch: false,
  startDate: "",
  endDate: "",
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Brouiyon",
  OPEN: "Enskripsyon ouvè",
  IN_PROGRESS: "An kou",
  COMPLETED: "Fini",
  ARCHIVED: "Archive",
};

export function CompetitionPage() {
  const { toast } = useToast();
  const [competitions, setCompetitions] = useState<CompetitionData[]>([]);
  const [teams, setTeams] = useState<TeamData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [activeComp, setActiveComp] = useState<CompetitionData | null>(null);
  const [form, setForm] = useState<CreateForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [compRes, teamRes] = await Promise.all([
        fetch("/api/competitions").then((r) => r.json()),
        fetch("/api/teams").then((r) => r.json()),
      ]);
      setCompetitions(compRes.competitions ?? []);
      setTeams(teamRes.teams ?? []);
    } catch (e: any) {
      toast({ title: "Erè", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const openCompetition = async (id: string) => {
    try {
      const res = await fetch(`/api/competitions/${id}`);
      const data = await res.json();
      setActiveComp(data.competition);
    } catch (e: any) {
      toast({ title: "Erè", description: e.message, variant: "destructive" });
    }
  };

  const submitCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast({ title: "Mannya", description: "Tanpri bay non konpetisyon an", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/competitions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "echwe");
      }
      const data = await res.json();
      toast({
        title: "Konpetisyon kreye",
        description: `${data.competition.name} (${data.competition.season})`,
      });
      setForm(EMPTY_FORM);
      setShowCreate(false);
      await fetchAll();
      await openCompetition(data.competition.id);
    } catch (e: any) {
      toast({ title: "Erè", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const updateStatus = async (compId: string, status: string) => {
    try {
      const res = await fetch(`/api/competitions/${compId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("echwe");
      toast({ title: "Estati chanje", description: `Kounye a: ${STATUS_LABELS[status] ?? status}` });
      await fetchAll();
      if (activeComp?.id === compId) await openCompetition(compId);
    } catch (e: any) {
      toast({ title: "Erè", description: e.message, variant: "destructive" });
    }
  };

  const deleteComp = async (compId: string) => {
    if (!confirm("Efase konpetisyon sa a? Tout match yo ap disparaite tou.")) return;
    try {
      await fetch(`/api/competitions/${compId}`, { method: "DELETE" });
      toast({ title: "Konpetisyon efase" });
      if (activeComp?.id === compId) setActiveComp(null);
      await fetchAll();
    } catch (e: any) {
      toast({ title: "Erè", description: e.message, variant: "destructive" });
    }
  };

  // ─── Detail view (single competition editor) ───
  if (activeComp) {
    return (
      <CompetitionEditor
        competition={activeComp}
        teams={teams}
        onBack={() => { setActiveComp(null); fetchAll(); }}
        onRefresh={() => openCompetition(activeComp.id)}
      />
    );
  }

  // ─── List view ───
  return (
    <div className="space-y-6">
      {/* Top action bar */}
      <section className="fifayiti-card p-4 md:p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <p className="eyebrow text-[#667085]">Jesyon</p>
          <h2 className="heading-md text-[#084C2A]">Konpetisyon yo</h2>
          <p className="meta text-[#667085] mt-1">
            Kreye ak jesyon konpetisyon FIFAYITI yo — faz gwoup + eliminatwa.
          </p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-featured">
          <Plus size={16} /> Kreye nouvo konpetisyon
        </button>
      </section>

      {/* List */}
      {loading ? (
        <div className="fifayiti-card border-dashed p-10 text-center">
          <p className="body-sm text-[#667085]">Ap charger konpetisyon yo...</p>
        </div>
      ) : competitions.length === 0 ? (
        <div className="fifayiti-card border-dashed p-10 text-center">
          <Trophy size={32} className="mx-auto text-[#E4E7EC]" />
          <p className="mt-3 body-sm font-bold text-[#101828]">Pa gen konpetisyon poko</p>
          <p className="meta text-[#667085] mt-1 mb-4">
            Kreye premye konpetisyon ou a. Prezidan ap bay non li.
          </p>
          <button onClick={() => setShowCreate(true)} className="btn-featured">
            <Plus size={16} /> Kreye premye konpetisyon an
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {competitions.map((c) => (
            <div key={c.id} className="fifayiti-card p-4 md:p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-[#116B3A] flex items-center justify-center">
                    <Trophy size={18} className="text-[#F4C400]" />
                  </div>
                  <div>
                    <p className="body-sm font-extrabold text-[#101828]">{c.name}</p>
                    <p className="meta text-[#667085]">
                      Sezon {c.season} · {c.groupCount} gwoup · {c.teamsPerGroup} ekip
                    </p>
                  </div>
                </div>
                <span
                  className="eyebrow px-2 py-1 rounded"
                  style={{
                    background: c.status === "IN_PROGRESS" ? "#116B3A"
                      : c.status === "COMPLETED" ? "#667085"
                      : c.status === "OPEN" ? "#F4C400" : "#E4E7EC",
                    color: c.status === "OPEN" || c.status === "DRAFT" ? "#084C2A" : "#FFFFFF",
                  }}
                >
                  {STATUS_LABELS[c.status] ?? c.status}
                </span>
              </div>

              <div className="mt-4 pt-4 border-t border-[#E4E7EC] flex items-center justify-between">
                <span className="meta text-[#667085]">
                  {c._count?.matches ?? 0} match · {c._count?.registrations ?? 0} ekip enskri
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => openCompetition(c.id)}
                    className="btn-secondary"
                  >
                    <Settings size={14} /> Modifye
                  </button>
                  <button
                    onClick={() => deleteComp(c.id)}
                    className="inline-flex items-center justify-center w-10 h-10 rounded-lg hover:bg-[#D92D20]/10"
                    aria-label="Efase"
                  >
                    <Trash2 size={14} className="text-[#D92D20]" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-[#E4E7EC] px-6 py-4 flex items-center justify-between">
              <div>
                <p className="eyebrow text-[#667085]">Fòm</p>
                <h2 className="heading-md text-[#084C2A]">Kreye nouvo konpetisyon</h2>
              </div>
              <button
                onClick={() => setShowCreate(false)}
                className="inline-flex items-center justify-center w-10 h-10 rounded-[10px] bg-[#F4F7F3]"
                aria-label="Fèmen"
              >
                <X size={18} className="text-[#084C2A]" />
              </button>
            </div>
            <form onSubmit={submitCreate} className="px-6 py-5 space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <Field label="Non konpetisyon *">
                  <input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="FIFAYITI Koup 2026"
                    className="input"
                    required
                  />
                </Field>
                <Field label="Sezon">
                  <input
                    value={form.season}
                    onChange={(e) => setForm({ ...form, season: e.target.value })}
                    placeholder="2026"
                    className="input"
                  />
                </Field>
              </div>

              <div className="grid md:grid-cols-3 gap-4">
                <Field label="Kantite gwoup">
                  <input
                    type="number" min="1" max="16"
                    value={form.groupCount}
                    onChange={(e) => setForm({ ...form, groupCount: Number(e.target.value) })}
                    className="input"
                  />
                </Field>
                <Field label="Ekip pa gwoup">
                  <input
                    type="number" min="2" max="12"
                    value={form.teamsPerGroup}
                    onChange={(e) => setForm({ ...form, teamsPerGroup: Number(e.target.value) })}
                    className="input"
                  />
                </Field>
                <Field label="Kalifye pa gwoup">
                  <input
                    type="number" min="1" max="6"
                    value={form.qualifiersPerGroup}
                    onChange={(e) => setForm({ ...form, qualifiersPerGroup: Number(e.target.value) })}
                    className="input"
                  />
                </Field>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <Field label="Tip Round Robin">
                  <select
                    value={form.rrType}
                    onChange={(e) => setForm({ ...form, rrType: e.target.value as any })}
                    className="input"
                  >
                    <option value="SINGLE">Senp (1 match pa pè)</option>
                    <option value="DOUBLE">Doub (2 match — lakay + deyò)</option>
                  </select>
                </Field>
                <Field label="Dat kòmanse">
                  <input
                    type="date"
                    value={form.startDate}
                    onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                    className="input"
                  />
                </Field>
              </div>

              <Field label="Dat fen">
                <input
                  type="date"
                  value={form.endDate}
                  onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                  className="input"
                />
              </Field>

              <div className="space-y-2 pt-2">
                <Toggle
                  label="Faz eliminatwa (knockout)"
                  description="Ajoute tablo apre faz gwoup (World Cup / UCL pattern)"
                  checked={form.hasKnockoutPhase}
                  onChange={(v) => setForm({ ...form, hasKnockoutPhase: v })}
                />
                <Toggle
                  label="Match pou 3yèm plas"
                  description="Pèdtè demifinal yo jwe pou 3yèm plas"
                  checked={form.hasThirdPlaceMatch}
                  onChange={(v) => setForm({ ...form, hasThirdPlaceMatch: v })}
                />
              </div>

              <div className="pt-4 border-t border-[#E4E7EC] flex items-center justify-end gap-3">
                <button type="button" onClick={() => setShowCreate(false)} className="btn-secondary">
                  Anile
                </button>
                <button type="submit" disabled={saving} className="btn-primary disabled:opacity-60">
                  {saving ? "Ap sove..." : "Sove konpetisyon"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block eyebrow text-[#667085] mb-1.5">{label}</span>
      {children}
    </label>
  );
}

function Toggle({
  label, description, checked, onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={cn(
        "w-full flex items-center justify-between gap-3 px-4 py-3 rounded-lg border transition-colors text-left",
        checked ? "border-[#116B3A] bg-[#116B3A]/5" : "border-[#E4E7EC] bg-white"
      )}
    >
      <div>
        <p className="body-sm font-bold text-[#101828]">{label}</p>
        {description && <p className="meta text-[#667085] mt-0.5">{description}</p>}
      </div>
      <div
        className={cn(
          "w-12 h-7 rounded-full p-1 transition-colors shrink-0",
          checked ? "bg-[#116B3A]" : "bg-[#D0D5DD]"
        )}
      >
        <div
          className={cn(
            "w-5 h-5 rounded-full bg-white transition-transform",
            checked ? "translate-x-5" : ""
          )}
        />
      </div>
    </button>
  );
}

// ─── Single-competition editor ─────────────────────────────────────
function CompetitionEditor({
  competition, teams, onBack, onRefresh,
}: {
  competition: CompetitionData;
  teams: TeamData[];
  onBack: () => void;
  onRefresh: () => void;
}) {
  const { toast } = useToast();
  const [assignments, setAssignments] = useState<Record<string, string>>({}); // teamId -> groupName
  const [savingAssign, setSavingAssign] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [scheduleStartDate, setScheduleStartDate] = useState("");

  // Init assignments from current registrations
  useEffect(() => {
    const map: Record<string, string> = {};
    for (const g of competition.groups ?? []) {
      for (const tr of g.teams) {
        map[tr.teamId] = g.name;
      }
    }
    setAssignments(map);
  }, [competition]);

  const groupNames = Array.from({ length: competition.groupCount }, (_, i) =>
    String.fromCharCode(65 + i)
  );

  const assignedTeamIds = new Set(Object.keys(assignments));
  const unassignedTeams = teams.filter((t) => !assignedTeamIds.has(t.id));

  const saveAssignments = async () => {
    setSavingAssign(true);
    try {
      const payload = Object.entries(assignments).map(([teamId, groupName]) => ({
        teamId,
        groupName,
      }));
      const res = await fetch(`/api/competitions/${competition.id}/assign-teams`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignments: payload }),
      });
      if (!res.ok) throw new Error("echwe");
      toast({ title: "Ekip yo repati", description: "Afektasyon gwoup sove" });
      onRefresh();
    } catch (e: any) {
      toast({ title: "Erè", description: e.message, variant: "destructive" });
    } finally {
      setSavingAssign(false);
    }
  };

  const generateSchedule = async () => {
    setGenerating(true);
    try {
      const res = await fetch(`/api/competitions/${competition.id}/generate-schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate: scheduleStartDate || undefined,
          daysBetweenRounds: 1,
        }),
      });
      if (!res.ok) throw new Error("echwe");
      const data = await res.json();
      toast({
        title: "Pwogram jenere",
        description: `${data.matchesCreated} match kreye.`,
      });
      onRefresh();
    } catch (e: any) {
      toast({ title: "Erè", description: e.message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  const updateStatus = async (status: string) => {
    try {
      const res = await fetch(`/api/competitions/${competition.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("echwe");
      toast({ title: "Estati chanje", description: STATUS_LABELS[status] });
      onRefresh();
    } catch (e: any) {
      toast({ title: "Erè", description: e.message, variant: "destructive" });
    }
  };

  const totalAssigned = Object.keys(assignments).length;
  const expectedTeams = competition.groupCount * competition.teamsPerGroup;

  return (
    <div className="space-y-6">
      {/* Header */}
      <section className="fifayiti-card p-4 md:p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-4">
            <button
              onClick={onBack}
              className="inline-flex items-center justify-center w-10 h-10 rounded-[10px] bg-[#F4F7F3]"
              aria-label="Retounen"
            >
              <ChevronRight size={18} className="text-[#084C2A] rotate-180" />
            </button>
            <div className="w-12 h-12 rounded-xl bg-[#116B3A] flex items-center justify-center">
              <Trophy size={22} className="text-[#F4C400]" />
            </div>
            <div>
              <p className="eyebrow text-[#667085] mb-1">Detay konpetisyon</p>
              <h2 className="heading-xl text-[#084C2A]">{competition.name}</h2>
              <p className="body-sm text-[#667085]">
                Sezon {competition.season} · {competition.groupCount} gwoup · {competition.teamsPerGroup} ekip ·{" "}
                {competition.rrType === "DOUBLE" ? "Round robin doub" : "Round robin senp"}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={competition.status}
              onChange={(e) => updateStatus(e.target.value)}
              className="input"
              style={{ width: "auto", minHeight: 40 }}
            >
              <option value="DRAFT">Brouiyon</option>
              <option value="OPEN">Enskripsyon ouvè</option>
              <option value="IN_PROGRESS">An kou</option>
              <option value="COMPLETED">Fini</option>
              <option value="ARCHIVED">Archive</option>
            </select>
          </div>
        </div>
      </section>

      {/* Status info banner */}
      {totalAssigned < expectedTeams && (
        <section
          className="fifayiti-card p-4"
          style={{ borderColor: "#F4C400", background: "rgba(244,196,0,0.10)" }}
        >
          <div className="flex items-start gap-3">
            <AlertTriangle size={18} className="text-[#F4C400] shrink-0 mt-0.5" />
            <div>
              <p className="body-sm font-bold text-[#084C2A]">
                Repatisyon pa konplè ({totalAssigned}/{expectedTeams} ekip)
              </p>
              <p className="meta text-[#084C2A] mt-1">
                Ou bezwen {expectedTeams} ekip anvan ou ka jenere pwogram match yo.
              </p>
            </div>
          </div>
        </section>
      )}

      {/* Group assignment */}
      <section className="fifayiti-card p-4 md:p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="eyebrow text-[#667085]">Afektasyon gwoup</p>
            <h3 className="heading-md text-[#084C2A]">Repati ekip yo nan gwoup yo</h3>
          </div>
          <button
            onClick={saveAssignments}
            disabled={savingAssign}
            className="btn-primary disabled:opacity-60"
          >
            <Save size={14} /> {savingAssign ? "Ap sove..." : "Sove afektasyon"}
          </button>
        </div>

        {teams.length === 0 ? (
          <div className="py-8 text-center">
            <Users size={28} className="mx-auto text-[#E4E7EC]" />
            <p className="mt-2 body-sm font-bold text-[#101828]">Pa gen ekip enskri</p>
            <p className="meta text-[#667085] mt-1">
              Ou dwe kreye ekip yo anvan ou ka repati yo nan gwoup yo.
            </p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {groupNames.map((gName) => (
              <div key={gName} className="rounded-xl border border-[#D0D5DD] bg-[#F4F7F3] p-3">
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className="w-7 h-7 rounded-md flex items-center justify-center text-xs font-bold"
                    style={{ background: "#116B3A", color: "#FFFFFF" }}
                  >
                    {gName}
                  </span>
                  <p className="eyebrow text-[#667085]">Gwoup {gName}</p>
                </div>
                {/* Assigned teams */}
                <div className="space-y-1.5">
                  {Object.entries(assignments)
                    .filter(([, g]) => g === gName)
                    .map(([teamId]) => {
                      const team = teams.find((t) => t.id === teamId);
                      if (!team) return null;
                      return (
                        <div
                          key={teamId}
                          className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-md bg-white border border-[#E4E7EC]"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            {team.logoUrl ? (
                              <img src={team.logoUrl} alt={team.name} className="w-5 h-5 object-contain" />
                            ) : (
                              <div
                                className="w-5 h-5 rounded flex items-center justify-center text-[8px] font-bold"
                                style={{ background: team.primaryColor, color: team.secondaryColor }}
                              >
                                {team.shortName.slice(0, 3).toUpperCase()}
                              </div>
                            )}
                            <span className="body-sm font-semibold text-[#101828] truncate">{team.name}</span>
                          </div>
                          <button
                            onClick={() => {
                              const next = { ...assignments };
                              delete next[teamId];
                              setAssignments(next);
                            }}
                            className="text-[#667085] hover:text-[#D92D20]"
                            aria-label="Retire"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      );
                    })}
                  {unassignedTeams.length > 0 && (
                    <select
                      onChange={(e) => {
                        if (!e.target.value) return;
                        setAssignments({ ...assignments, [e.target.value]: gName });
                        e.target.value = "";
                      }}
                      className="input text-sm"
                      style={{ minHeight: 36 }}
                      value=""
                    >
                      <option value="">+ Ajoute ekip...</option>
                      {unassignedTeams.map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Schedule generator */}
      <section className="fifayiti-card p-4 md:p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="eyebrow text-[#667085]">Pwogram match</p>
            <h3 className="heading-md text-[#084C2A]">Jenere pwogram gwoup yo</h3>
            <p className="meta text-[#667085] mt-1">
              Kreye otomatik tout match gwoup yo (round-robin algorithm).
            </p>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-3 items-end">
          <Field label="Dat kòmanse (opsyonèl)">
            <input
              type="date"
              value={scheduleStartDate}
              onChange={(e) => setScheduleStartDate(e.target.value)}
              className="input"
            />
          </Field>
          <button
            onClick={generateSchedule}
            disabled={generating || totalAssigned < 2}
            className="btn-featured disabled:opacity-50"
          >
            <RefreshCw size={14} className={generating ? "animate-spin" : ""} />
            {generating ? "Ap jenere..." : "Jenere pwogram match"}
          </button>
        </div>

        {competition.matches && competition.matches.length > 0 && (
          <div className="mt-4 pt-4 border-t border-[#E4E7EC]">
            <p className="eyebrow text-[#667085] mb-2">
              {competition.matches.length} match ki egziste deja · Jenere ankò ap efase ansyen yo
            </p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-[300px] overflow-y-auto">
              {competition.matches.slice(0, 12).map((m) => {
                const home = teams.find((t) => t.id === m.homeTeamId);
                const away = teams.find((t) => t.id === m.awayTeamId);
                return (
                  <div key={m.id} className="rounded-md border border-[#E4E7EC] bg-white p-2">
                    <p className="meta text-[#667085]">
                      Joumatch {m.matchday} · Gwoup {m.groupLabel ?? "—"}
                    </p>
                    <p className="body-sm font-semibold text-[#101828]">
                      {home?.shortName ?? "?"} vs {away?.shortName ?? "?"}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* Format info */}
      <section className="fifayiti-card p-4 md:p-5">
        <div className="flex items-center gap-2 mb-3">
          <ListChecks size={14} className="text-[#116B3A]" />
          <p className="eyebrow text-[#667085]">Fòma konpetisyon</p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <InfoCard label="Gwoup" value={`${competition.groupCount}`} sub={`${competition.teamsPerGroup} ekip chak`} />
          <InfoCard label="Kalifye" value={`${competition.qualifiersPerGroup}`} sub="pa gwoup" />
          <InfoCard
            label="Faz eliminatwa"
            value={competition.hasKnockoutPhase ? "Wi" : "Non"}
            sub={competition.hasKnockoutPhase ? "Tablo KO" : "Sèlman gwoup"}
          />
          <InfoCard
            label="3yèm plas"
            value={competition.hasThirdPlaceMatch ? "Wi" : "Non"}
            sub={competition.hasThirdPlaceMatch ? "Match ekstra" : "Pa gen"}
          />
        </div>
      </section>
    </div>
  );
}

function InfoCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-[#E4E7EC] bg-[#F4F7F3] p-3">
      <p className="eyebrow text-[#667085]">{label}</p>
      <p className="score text-2xl text-[#084C2A] mt-1">{value}</p>
      {sub && <p className="meta text-[#667085] mt-0.5">{sub}</p>}
    </div>
  );
}
