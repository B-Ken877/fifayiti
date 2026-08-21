"use client";
import { useEffect, useState } from "react";
import { useAppStore } from "@/store/app-store";
import { useToast } from "@/hooks/use-toast";
import {
  teamStatusLabels,
  type Team,
  type TeamStatus,
} from "@/lib/fifayiti-data";
import { TeamCrest } from "../team-crest";
import {
  Users,
  MapPin,
  Calendar,
  Search,
  ChevronRight,
  ShieldCheck,
  Filter,
  Wifi,
  WifiOff,
  Plus,
  X,
  Upload,
  ImageIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

const STATUSES: (TeamStatus | "TOUT")[] = [
  "TOUT",
  "PRE_KREYE",
  "ENSKRIPSYON_OUVE",
  "SOUMET",
  "AN_VERIFIKASYON",
  "VERIFYE",
  "AKTIF",
];

const STATUS_TONE: Record<TeamStatus, { bg: string; fg: string; dot: string }> = {
  PRE_KREYE: { bg: "#E4E7EC", fg: "#667085", dot: "#667085" },
  ENSKRIPSYON_OUVE: { bg: "#F4C400", fg: "#084C2A", dot: "#084C2A" },
  SOUMET: { bg: "#116B3A", fg: "#FFFFFF", dot: "#7CE7A8" },
  AN_VERIFIKASYON: { bg: "#F4C400", fg: "#084C2A", dot: "#084C2A" },
  VERIFYE: { bg: "#116B3A", fg: "#FFFFFF", dot: "#7CE7A8" },
  AKTIF: { bg: "#116B3A", fg: "#FFFFFF", dot: "#7CE7A8" },
};

function StatusBadge({ status }: { status: TeamStatus }) {
  const tone = STATUS_TONE[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md eyebrow"
      style={{ background: tone.bg, color: tone.fg }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: tone.dot }} />
      {teamStatusLabels(status)}
    </span>
  );
}

interface CreateTeamForm {
  name: string;
  shortName: string;
  primaryColor: string;
  secondaryColor: string;
  founded: string;
  homeVenue: string;
  venueAddress: string;
  group: "A" | "B";
  logoUrl: string;
  photoUrl: string;
}

const EMPTY_FORM: CreateTeamForm = {
  name: "",
  shortName: "",
  primaryColor: "#116B3A",
  secondaryColor: "#F4C400",
  founded: String(new Date().getFullYear()),
  homeVenue: "",
  venueAddress: "",
  group: "A",
  logoUrl: "",
  photoUrl: "",
};

export function AdminTeamsPage() {
  const { setActiveTeamId, setView } = useAppStore();
  const { toast } = useToast();

  const [filter, setFilter] = useState<TeamStatus | "TOUT">("TOUT");
  const [q, setQ] = useState("");
  const [teams, setTeams] = useState<Team[]>([]);
  const [playersCount, setPlayersCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<CreateTeamForm>(EMPTY_FORM);

  const fetchTeams = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/teams");
      const data = await res.json();
      if (data.teams) {
        setTeams(data.teams);
        const totalPlayers = data.teams.reduce(
          (acc: number, t: any) => acc + (t.players?.length ?? 0),
          0
        );
        setPlayersCount(totalPlayers);
      }
    } catch (e: any) {
      toast({
        title: "Erè",
        description: "Pa ka charger ekip yo",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTeams();
  }, []);

  const filtered = teams.filter((t: any) => {
    const okStatus = filter === "TOUT" || t.status === filter;
    const okQ = q.trim() === "" || t.name.toLowerCase().includes(q.toLowerCase());
    return okStatus && okQ;
  });

  const openTeam = (id: string) => {
    setActiveTeamId(id);
    setView("admin-team-detail");
  };

  const counts: Record<string, number> = {
    TOUT: teams.length,
    AKTIF: teams.filter((t: any) => t.status === "AKTIF").length,
    AN_VERIFIKASYON: teams.filter((t: any) => t.status === "AN_VERIFIKASYON").length,
    VERIFYE: teams.filter((t: any) => t.status === "VERIFYE").length,
    SOUMET: teams.filter((t: any) => t.status === "SOUMET").length,
    ENSKRIPSYON_OUVE: teams.filter((t: any) => t.status === "ENSKRIPSYON_OUVE").length,
    PRE_KREYE: teams.filter((t: any) => t.status === "PRE_KREYE").length,
  };

  const kpis = [
    { label: "Ekip total", value: teams.length, tone: "#084C2A", bg: "#116B3A" },
    { label: "Aktif", value: counts.AKTIF, tone: "#FFFFFF", bg: "#116B3A" },
    { label: "An verifikasyon", value: counts.AN_VERIFIKASYON, tone: "#084C2A", bg: "#F4C400" },
    { label: "Jwè total", value: playersCount, tone: "#084C2A", bg: "#F4F7F3" },
  ];

  const uploadFile = async (file: File): Promise<string> => {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "upload echwe");
    }
    const data = await res.json();
    return data.url;
  };

  const onLogoFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const url = await uploadFile(f);
      setForm({ ...form, logoUrl: url });
      toast({ title: "Logo monte", description: url });
    } catch (err: any) {
      toast({ title: "Erè", description: err.message, variant: "destructive" });
    }
  };

  const onPhotoFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const url = await uploadFile(f);
      setForm({ ...form, photoUrl: url });
      toast({ title: "Foto ekip monte", description: url });
    } catch (err: any) {
      toast({ title: "Erè", description: err.message, variant: "destructive" });
    }
  };

  const submitCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.shortName.trim()) {
      toast({
        title: "Mannya",
        description: "Tanpri bay non ekip ak ti non",
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/teams", {
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
        title: "Ekip kreye",
        description: `${data.team.name} (${data.team.shortName}) ajoute`,
      });
      setForm(EMPTY_FORM);
      setShowCreate(false);
      await fetchTeams();
    } catch (err: any) {
      toast({ title: "Erè", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* KPI bar */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {kpis.map((k) => (
          <div key={k.label} className="fifayiti-card p-4 md:p-5" style={{ background: k.bg }}>
            <p className="heading-lg tnum" style={{ color: k.tone }}>{k.value}</p>
            <p className="mt-1 eyebrow" style={{ color: k.tone, opacity: 0.7 }}>{k.label}</p>
          </div>
        ))}
      </section>

      {/* Top action bar — Create New Team button */}
      <section className="fifayiti-card p-4 md:p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <p className="eyebrow text-[#667085]">Aksyon</p>
          <h2 className="heading-md text-[#084C2A]">Kreye / modifye ekip</h2>
          <p className="meta text-[#667085] mt-1">
            Prezidan oswa Direktè Konpetisyon kap ajoute nouvo ekip la a.
          </p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-featured">
          <Plus size={16} /> Kreye nouvo ekip
        </button>
      </section>

      {/* Search + filters */}
      <section className="fifayiti-card p-4 md:p-5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-4">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#667085]" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Chache ekip (pa non)"
              className="w-full pl-10 pr-4 py-2.5 rounded-[10px] border border-[#E4E7EC] bg-[#F4F7F3] body-sm text-[#101828] focus:outline-none focus:border-[#116B3A] focus:ring-2 focus:ring-[#116B3A]/10"
              style={{ minHeight: 44 }}
            />
          </div>
          <div className="flex items-center gap-2 eyebrow text-[#667085]">
            <Filter size={14} /> Filtre pa estati
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {STATUSES.map((s) => {
            const isActive = filter === s;
            const label = s === "TOUT" ? "Tout" : teamStatusLabels(s);
            return (
              <button
                key={s}
                onClick={() => setFilter(s)}
                className={cn(
                  "inline-flex items-center gap-2 px-3 py-2 rounded-[10px] body-sm font-bold transition-all",
                  isActive ? "bg-[#084C2A] text-white" : "bg-[#F4F7F3] text-[#667085] hover:bg-[#E4E7EC]"
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

      {/* Teams grid */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="heading-lg text-[#084C2A]">
            Tout ekip (<span className="tnum">{filtered.length}</span>)
          </h2>
        </div>

        {loading ? (
          <div className="fifayiti-card border-dashed p-10 text-center">
            <p className="body-sm text-[#667085]">Ap charger ekip yo...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="fifayiti-card border-dashed p-10 text-center">
            <p className="body-sm font-bold text-[#101828]">Pa gen ekip pou kounye a</p>
            <p className="meta text-[#667085] mt-1 mb-4">
              Klike sou "Kreye nouvo ekip" pou ajoute premye ekip ou a.
            </p>
            <button onClick={() => setShowCreate(true)} className="btn-featured">
              <Plus size={16} /> Kreye premye ekip la
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((t: any) => (
              <button
                key={t.id}
                onClick={() => openTeam(t.id)}
                className="group text-left fifayiti-card p-4 md:p-5 hover:border-[#116B3A] hover:shadow-md transition-all"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    {t.logoUrl ? (
                      <img
                        src={t.logoUrl}
                        alt={t.name}
                        className="w-12 h-12 object-contain rounded-lg"
                      />
                    ) : (
                      <TeamCrest
                        teamId={t.id}
                        shortName={t.shortName}
                        primary={t.primaryColor}
                        secondary={t.secondaryColor}
                        size="md"
                      />
                    )}
                    <div>
                      <p className="body-sm font-extrabold text-[#101828]">{t.name}</p>
                      <p className="meta text-[#667085]">
                        Group {t.group} · {t.shortName}
                      </p>
                    </div>
                  </div>
                  <ChevronRight
                    size={18}
                    className="text-[#667085] group-hover:text-[#116B3A] transition-colors"
                  />
                </div>

                <div className="mt-4 flex items-center justify-between">
                  <StatusBadge status={t.status} />
                  <span className="meta font-bold text-[#667085]">
                    Group {t.group}
                  </span>
                </div>

                <div className="mt-4 pt-4 border-t border-[#E4E7EC] grid grid-cols-3 gap-2">
                  <Stat
                    icon={<Users size={13} className="text-[#116B3A]" />}
                    label="Jwè"
                    value={String(t.players?.length ?? 0)}
                  />
                  <Stat
                    icon={<Calendar size={13} className="text-[#116B3A]" />}
                    label="Enskri"
                    value={t.registeredAt ?? "—"}
                  />
                  <Stat
                    icon={<MapPin size={13} className="text-[#116B3A]" />}
                    label="Stad"
                    value={t.homeVenue ? t.homeVenue.replace(" Field", "") : "—"}
                  />
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Create Team modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-[#E4E7EC] px-6 py-4 flex items-center justify-between">
              <div>
                <p className="eyebrow text-[#667085]">Fòm</p>
                <h2 className="heading-md text-[#084C2A]">Kreye nouvo ekip</h2>
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
                <Field label="Non ekip *">
                  <input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Delmas 31"
                    className="input"
                    required
                  />
                </Field>
                <Field label="Ti non (kòd) *">
                  <input
                    value={form.shortName}
                    onChange={(e) => setForm({ ...form, shortName: e.target.value })}
                    placeholder="DLM 31"
                    className="input"
                    maxLength={8}
                    required
                  />
                </Field>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <Field label="Koulè prensipal">
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={form.primaryColor}
                      onChange={(e) => setForm({ ...form, primaryColor: e.target.value })}
                      className="w-12 h-10 rounded border border-[#E4E7EC]"
                    />
                    <input
                      value={form.primaryColor}
                      onChange={(e) => setForm({ ...form, primaryColor: e.target.value })}
                      className="input flex-1 font-mono"
                    />
                  </div>
                </Field>
                <Field label="Koulè segondè">
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={form.secondaryColor}
                      onChange={(e) => setForm({ ...form, secondaryColor: e.target.value })}
                      className="w-12 h-10 rounded border border-[#E4E7EC]"
                    />
                    <input
                      value={form.secondaryColor}
                      onChange={(e) => setForm({ ...form, secondaryColor: e.target.value })}
                      className="input flex-1 font-mono"
                    />
                  </div>
                </Field>
              </div>

              <div className="grid md:grid-cols-3 gap-4">
                <Field label="Ane fondasyon">
                  <input
                    value={form.founded}
                    onChange={(e) => setForm({ ...form, founded: e.target.value })}
                    placeholder="2024"
                    className="input"
                  />
                </Field>
                <Field label="Gwoup">
                  <select
                    value={form.group}
                    onChange={(e) => setForm({ ...form, group: e.target.value as "A" | "B" })}
                    className="input"
                  >
                    <option value="A">Gwoup A</option>
                    <option value="B">Gwoup B</option>
                  </select>
                </Field>
                <Field label="Stad / Teren">
                  <input
                    value={form.homeVenue}
                    onChange={(e) => setForm({ ...form, homeVenue: e.target.value })}
                    placeholder="Delmas 31 Field"
                    className="input"
                  />
                </Field>
              </div>

              <Field label="Adrès">
                <input
                  value={form.venueAddress}
                  onChange={(e) => setForm({ ...form, venueAddress: e.target.value })}
                  placeholder="Delmas 31, Port-au-Prince"
                  className="input"
                />
              </Field>

              {/* Logo + Photo uploads */}
              <div className="grid md:grid-cols-2 gap-4">
                <Field label="Logo ekip (opsyonèl)">
                  <div className="flex items-center gap-3">
                    {form.logoUrl ? (
                      <img src={form.logoUrl} alt="logo" className="w-12 h-12 object-contain rounded border border-[#E4E7EC]" />
                    ) : (
                      <div className="w-12 h-12 rounded border border-dashed border-[#E4E7EC] flex items-center justify-center text-[#667085]">
                        <ImageIcon size={18} />
                      </div>
                    )}
                    <label className="btn-secondary cursor-pointer">
                      <Upload size={14} /> Monte logo
                      <input type="file" accept="image/*" onChange={onLogoFile} className="hidden" />
                    </label>
                    {form.logoUrl && (
                      <button
                        type="button"
                        onClick={() => setForm({ ...form, logoUrl: "" })}
                        className="meta text-[#D92D20] hover:underline"
                      >
                        Retire
                      </button>
                    )}
                  </div>
                </Field>
                <Field label="Foto ekip (opsyonèl)">
                  <div className="flex items-center gap-3">
                    {form.photoUrl ? (
                      <img src={form.photoUrl} alt="team" className="w-12 h-12 object-cover rounded border border-[#E4E7EC]" />
                    ) : (
                      <div className="w-12 h-12 rounded border border-dashed border-[#E4E7EC] flex items-center justify-center text-[#667085]">
                        <ImageIcon size={18} />
                      </div>
                    )}
                    <label className="btn-secondary cursor-pointer">
                      <Upload size={14} /> Monte foto
                      <input type="file" accept="image/*" onChange={onPhotoFile} className="hidden" />
                    </label>
                    {form.photoUrl && (
                      <button
                        type="button"
                        onClick={() => setForm({ ...form, photoUrl: "" })}
                        className="meta text-[#D92D20] hover:underline"
                      >
                        Retire
                      </button>
                    )}
                  </div>
                </Field>
              </div>

              <div className="pt-4 border-t border-[#E4E7EC] flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="btn-secondary"
                >
                  Anile
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="btn-primary disabled:opacity-60"
                >
                  {saving ? "Ap sove..." : "Sove ekip"}
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

function Stat({
  icon, label, value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-1 text-[#667085] mb-0.5">{icon}</div>
      <p className="eyebrow text-[#667085]">{label}</p>
      <p className="body-sm font-bold text-[#101828] truncate">{value}</p>
    </div>
  );
}
