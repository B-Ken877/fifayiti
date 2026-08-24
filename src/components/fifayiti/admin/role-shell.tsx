"use client";

// Role-specialized admin shells.
//
// Previously all authed admin roles shared ONE AdminShell that rendered all
// 13 nav items + the same dashboard regardless of role. That meant:
//   - The live operator saw Finances / Discipline / Admins pages they can't
//     use, with no obvious entry point to their actual job (match control).
//   - The team admin saw Schedule Match / Finances they have no permission
//     for, instead of their read-only rosters.
//   - The cameraman saw the full admin SPA when they actually need a
//     direct redirect to /operator/camera/[slot].
//
// This module exports:
//   - RoleShell           — the master shell that picks the right sidebar
//                            per role
//   - CameramanRedirect   — small client component that hard-redirects
//                            cameramanN to /operator/camera/N (used in
//                            app/page.tsx instead of rendering AdminShell
//                            for the cameraman roles)
//
// Each role gets a SIDEBAR_PRESET entry that lists exactly the nav items
// that role needs, grouped by what they actually do.

import { useEffect, useState } from "react";
import { useAppStore, type ViewKey } from "@/store/app-store";
import { useAuthSessionStore, type AdminRole } from "@/store/auth-session-store";
import { BrandMark } from "../brand-mark";
import {
  LayoutDashboard,
  Users,
  UserCheck,
  Trophy,
  CalendarClock,
  Megaphone,
  BarChart3,
  Tv,
  Film,
  Wallet,
  ScrollText,
  Shield,
  Settings,
  LogOut,
  Bell,
  Menu,
  X,
  Cloud,
  Camera,
  Radio,
  Eye,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem { label: string; view: ViewKey; icon: LucideIcon; group?: string; }
interface RolePreset {
  label: string;        // long role name shown in header
  avatar: string;       // 2-char avatar
  nav: NavItem[];       // sidebar nav tailored to role
  tagline: string;      // shown under role label in sidebar
}

const COMMON_NAV: NavItem[] = [
  { label: "Apèsi", view: "admin-dashboard", icon: LayoutDashboard },
];

const FULL_NAV: NavItem[] = [
  { label: "Apèsi", view: "admin-dashboard", icon: LayoutDashboard },
  { label: "Ekip", view: "admin-teams", icon: Users, group: "Operasyon" },
  { label: "Jwè", view: "admin-players", icon: UserCheck },
  { label: "Konpetisyon", view: "admin-competitions", icon: Trophy },
  { label: "Orè", view: "admin-schedule", icon: CalendarClock },
  { label: "Match", view: "admin-match-control", icon: Megaphone },
  { label: "Klasman", view: "standings", icon: BarChart3 },
  { label: "FIFAYITI TV", view: "tv", icon: Tv, group: "Broadcast" },
  { label: "Replay", view: "admin-replays", icon: Film },
  { label: "Finans", view: "admin-finances", icon: Wallet, group: "Administrasyon" },
  { label: "Disiplin", view: "admin-discipline", icon: ScrollText },
  { label: "Administratè", view: "admin-admins", icon: Shield },
  { label: "Paramèt", view: "admin-settings", icon: Settings },
];

// President — full superuser, sees everything.
const PRESIDENT_PRESET: RolePreset = {
  label: "Prezidan FIFAYITI",
  avatar: "PR",
  tagline: "Superuzè — tout aksè",
  nav: FULL_NAV,
};

// Director — competition operations + administration, but does NOT see
// schedule.approve or admins.manage (president-only). The Admins page
// is hidden from their sidebar (still accessible by URL but the page
// itself hides the manage affordance — server still enforces).
const DIRECTOR_PRESET: RolePreset = {
  label: "Direktè Konpetisyon",
  avatar: "DK",
  tagline: "Operasyon + administrasyon",
  nav: FULL_NAV.filter((n) => n.view !== "admin-admins"),
};

// Live operator — broadcast desk. Their day revolves around: which match
// is on, which camera is on TV, replays. They do NOT need the teams /
// finance / discipline / admins pages in their sidebar.
const LIVE_OPERATOR_PRESET: RolePreset = {
  label: "Operatè live",
  avatar: "OP",
  tagline: "Broadcast — match, kamera, replay",
  nav: [
    { label: "Apèsi", view: "admin-dashboard", icon: LayoutDashboard },
    { label: "Match", view: "admin-match-control", icon: Megaphone, group: "Broadcast" },
    { label: "FIFAYITI TV", view: "tv", icon: Tv },
    { label: "Replay", view: "admin-replays", icon: Film },
    { label: "Orè", view: "admin-schedule", icon: CalendarClock, group: "Kontèks" },
    { label: "Konpetisyon", view: "admin-competitions", icon: Trophy },
    { label: "Paramèt", view: "admin-settings", icon: Settings, group: "Sistèm" },
  ],
};

// Team admin — read-only. They verify player rosters, look at teams &
// upcoming schedule, but cannot edit. Their sidebar shows only those 3
// pages + settings.
const TEAM_ADMIN_PRESET: RolePreset = {
  label: "Administratè ekip",
  avatar: "TA",
  tagline: "Lectèr — ekip, jwè, orè",
  nav: [
    { label: "Apèsi", view: "admin-dashboard", icon: LayoutDashboard },
    { label: "Ekip", view: "admin-teams", icon: Users, group: "Done" },
    { label: "Jwè", view: "admin-players", icon: UserCheck },
    { label: "Orè", view: "admin-schedule", icon: CalendarClock },
    { label: "Paramèt", view: "admin-settings", icon: Settings, group: "Sistèm" },
  ],
};

const ROLE_PRESETS: Record<AdminRole, RolePreset> = {
  president: PRESIDENT_PRESET,
  director: DIRECTOR_PRESET,
  live_operator: LIVE_OPERATOR_PRESET,
  team_admin: TEAM_ADMIN_PRESET,
  // Cameramen never reach AdminShell — they get redirected by
  // CameramanRedirect. This entry is only here so the lookup typechecks.
  cameraman: LIVE_OPERATOR_PRESET,
  cameraman1: LIVE_OPERATOR_PRESET,
  cameraman2: LIVE_OPERATOR_PRESET,
  cameraman3: LIVE_OPERATOR_PRESET,
};

const PAGE_TITLES: Record<string, string> = {
  "admin-dashboard": "Apèsi Jeneral",
  "admin-teams": "Jesyon Ekip",
  "admin-team-detail": "Detay Ekip",
  "admin-players": "Verifikasyon Jwè",
  "admin-competitions": "Jesyon Konpetisyon",
  "admin-schedule": "Orè Konpetisyon",
  "admin-match-control": "Kontwòl Match",
  "admin-replays": "Replay Archive",
  "admin-finances": "Finans",
  "admin-discipline": "Disiplin",
  "admin-admins": "Administratè",
  "admin-settings": "Paramèt",
  standings: "Klasman ofisyèl",
  tv: "FIFAYITI TV",
};

export function RoleShell({ children }: { children: React.ReactNode }) {
  const { view, setView } = useAppStore();
  const { adminRole, setAdminAuthed } = useAuthSessionStore();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeCompName, setActiveCompName] = useState<string | null>(null);

  // Cameraman should never reach here — app/page.tsx redirects them.
  // If we somehow do, bail.
  if (adminRole === "cameraman" || adminRole === "cameraman1" ||
      adminRole === "cameraman2" || adminRole === "cameraman3") {
    return <CameramanRedirect role={adminRole} />;
  }

  const preset = ROLE_PRESETS[adminRole] ?? PRESIDENT_PRESET;
  const nav = preset.nav;
  const title = PAGE_TITLES[view] ?? "Administrasyon";

  // Fetch the active competition name once on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/competitions/active");
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data.competition) setActiveCompName(data.competition.name);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []);

  const logout = async () => {
    try { await fetch("/api/auth/logout", { method: "POST" }); } catch {}
    setAdminAuthed(false);
    setView("home");
    window.location.href = "/";
  };

  return (
    <div className="min-h-screen flex admin-workspace">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-[248px] bg-[#084C2A] text-white flex flex-col transition-transform md:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}
      >
        <div className="flex items-center justify-between px-4 h-[72px] border-b border-white/10">
          <BrandMark size="sm" variant="white" />
          <button
            className="md:hidden text-white/70"
            onClick={() => setMobileOpen(false)}
            aria-label="Fèmen"
            style={{ minHeight: 44, minWidth: 44 }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Role badge — shows the operator exactly who they are */}
        <div className="px-4 py-3 border-b border-white/10">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#F4C400] text-[#084C2A] flex items-center justify-center text-xs font-bold">
              {preset.avatar}
            </div>
            <div className="min-w-0">
              <p className="body-sm font-bold text-white truncate">{preset.label}</p>
              <p className="meta text-white/60 truncate">{preset.tagline}</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto py-3">
          <div className="px-3 space-y-0.5">
            {nav.map((item, idx) => {
              const Icon = item.icon;
              const active = view === item.view ||
                (view === "admin-team-detail" && item.view === "admin-teams");
              if (item.group) {
                return (
                  <div key={`${item.label}-${idx}`}>
                    <p className="pt-4 pb-1 px-2 eyebrow text-white/40">
                      {item.group}
                    </p>
                    <NavBtn item={item} active={active} onClick={() => {
                      setView(item.view); setMobileOpen(false);
                    }} />
                  </div>
                );
              }
              return (
                <NavBtn
                  key={`${item.label}-${idx}`}
                  item={item}
                  active={active}
                  onClick={() => { setView(item.view); setMobileOpen(false); }}
                />
              );
            })}
          </div>
        </nav>
        <div className="border-t border-white/10 p-3">
          <button
            onClick={logout}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg body-sm text-white/70 hover:bg-white/5 hover:text-white transition-colors"
            style={{ minHeight: 44 }}
          >
            <LogOut size={16} />
            Dekonekte
          </button>
        </div>
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 md:hidden" onClick={() => setMobileOpen(false)} />
      )}

      <div className="flex-1 md:ml-[248px] flex flex-col min-w-0">
        <header className="sticky top-0 z-30 bg-white border-b border-[#E4E7EC] flex items-center px-4 md:px-6 gap-3" style={{ height: 72 }}>
          <button
            className="md:hidden p-2 -ml-2 text-[#084C2A]"
            onClick={() => setMobileOpen(true)}
            aria-label="Menu"
            style={{ minHeight: 44, minWidth: 44 }}
          >
            <Menu size={20} />
          </button>
          <h1 className="heading-lg text-[#084C2A] truncate flex-1">
            {title}
          </h1>

          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#F4F7F3]">
            <Trophy size={14} className="text-[#116B3A]" />
            <span className="body-sm font-semibold text-[#084C2A]">
              {activeCompName ?? "Pa gen konpetisyon aktif"}
            </span>
          </div>

          <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#F4F7F3]">
            <Cloud size={14} className="text-[#116B3A]" />
            <span className="meta font-semibold text-[#116B3A]">Senkronize</span>
          </div>

          <button
            className="relative p-2 rounded-lg hover:bg-[#F4F7F3]"
            style={{ minHeight: 44, minWidth: 44 }}
            aria-label="Notifikasyon"
          >
            <Bell size={18} className="text-[#667085]" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#D92D20]" />
          </button>

          <div className="flex items-center gap-2 pl-2">
            <div className="w-9 h-9 rounded-full bg-[#116B3A] flex items-center justify-center text-white text-xs font-bold">
              {preset.avatar}
            </div>
            <div className="hidden md:block leading-none">
              <p className="body-sm font-bold text-[#084C2A]">{preset.label}</p>
              <p className="meta text-[#667085] mt-0.5">{adminRole}@fifayiti.com</p>
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 md:p-6 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}

function NavBtn({
  item, active, onClick,
}: {
  item: NavItem;
  active: boolean;
  onClick: () => void;
}) {
  const Icon = item.icon;
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 w-full px-3 py-2.5 rounded-lg body-sm transition-colors",
        active
          ? "bg-[#F4C400] text-[#084C2A] font-bold"
          : "text-white/70 hover:bg-white/5 hover:text-white"
      )}
      style={{ minHeight: 44 }}
    >
      <Icon size={16} />
      <span className="truncate">{item.label}</span>
    </button>
  );
}

/**
 * CameramanRedirect — hard-redirects a cameraman role to its slot URL.
 *
 *   cameraman   → /operator/camera/1 (legacy — keeps existing bookmarks)
 *   cameraman1  → /operator/camera/1
 *   cameraman2  → /operator/camera/2
 *   cameraman3  → /operator/camera/3
 *
 * The middleware will re-verify the role + URL combination, so a
 * cameraman1 user who manually types /operator/camera/2 will be bounced
 * back to /login.
 */
export function CameramanRedirect({ role }: { role: AdminRole }) {
  useEffect(() => {
    let slot = 1;
    if (role === "cameraman2") slot = 2;
    else if (role === "cameraman3") slot = 3;
    // cameraman / cameraman1 → slot 1
    window.location.href = `/operator/camera/${slot}`;
  }, [role]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#053319] text-white">
      <div className="text-center">
        <Camera size={40} className="mx-auto mb-3 text-[#F4C400] animate-pulse" />
        <p className="heading-md">Redeksyon...</p>
        <p className="meta text-white/60 mt-1">
          {role} ap voye ou sou /operator/camera/{role === "cameraman3" ? "3" : role === "cameraman2" ? "2" : "1"}
        </p>
      </div>
    </div>
  );
}

// ─── Per-role dashboard greeting ────────────────────────────────────
// Each dashboard starts with a role-specific greeting banner so the
// operator sees immediately what they can do today. Rendered at the top
// of AdminDashboard.

export function RoleGreetingBanner({ role }: { role: AdminRole }) {
  if (role === "cameraman" || role === "cameraman1" || role === "cameraman2" || role === "cameraman3") {
    return null;  // never rendered for cameramen
  }

  const PRESETS: Record<AdminRole, { icon: LucideIcon; title: string; body: string; bg: string }> = {
    president: {
      icon: Shield,
      title: "Byenveni, Prezidan",
      body: "Ou gen tout aksè sou sistèm FIFAYITI a — konpetisyon, ekip, finans, disiplin, administratè.",
      bg: "#084C2A",
    },
    director: {
      icon: Trophy,
      title: "Byenveni, Direktè Konpetisyon",
      body: "Ou responsab operasyon ak administrasyon konpetisyon yo — ekip, jwè, orè, match, finans, disiplin.",
      bg: "#116B3A",
    },
    live_operator: {
      icon: Radio,
      title: "Byenveni, Operatè live",
      body: "Ou responsab broadcast la jodi a — chwazi match ki ap pase a, kontwole kamera yo, epi gade replays yo.",
      bg: "#0A5F30",
    },
    team_admin: {
      icon: Eye,
      title: "Byenveni, Administratè ekip",
      body: "Ou gen aksè lectèr sou ekip, jwè ak orè konpetisyon yo — verifye rosters epi swiv pwograme match yo.",
      bg: "#084C2A",
    },
    cameraman: { icon: Camera, title: "", body: "", bg: "" },
    cameraman1: { icon: Camera, title: "", body: "", bg: "" },
    cameraman2: { icon: Camera, title: "", body: "", bg: "" },
    cameraman3: { icon: Camera, title: "", body: "", bg: "" },
  };

  const preset = PRESETS[role];
  const Icon = preset.icon;
  return (
    <div
      className="rounded-2xl p-5 md:p-6 text-white flex items-start gap-4 mb-6"
      style={{ background: preset.bg }}
    >
      <div className="w-12 h-12 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
        <Icon size={22} />
      </div>
      <div>
        <p className="heading-lg">{preset.title}</p>
        <p className="body-sm text-white/80 mt-1">{preset.body}</p>
      </div>
      <button
        onClick={() => useAppStore.getState().setView("admin-match-control")}
        className="ml-auto hidden md:inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#F4C400] text-[#084C2A] font-bold body-sm hover:brightness-110 transition"
        style={{ minHeight: 40 }}
      >
        Ale nan match <ChevronRight size={14} />
      </button>
    </div>
  );
}
