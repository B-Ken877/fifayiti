"use client";
import { useAppStore, type ViewKey } from "@/store/app-store";
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
  WifiOff,
  Cloud,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";

const NAV: { label: string; view: ViewKey; icon: React.ElementType; group?: string }[] = [
  { label: "Apèsi", view: "admin-dashboard", icon: LayoutDashboard },
  { label: "Ekip", view: "admin-teams", icon: Users, group: "Operasyon" },
  { label: "Jwè", view: "admin-players", icon: UserCheck },
  { label: "Konpetisyon", view: "admin-competitions", icon: Trophy },
  { label: "Match", view: "admin-match-control", icon: Megaphone },
  { label: "Klasman", view: "standings", icon: BarChart3 },
  { label: "FIFAYITI TV", view: "tv", icon: Tv, group: "Broadcast" },
  { label: "Replay", view: "admin-replays", icon: Film },
  { label: "Finans", view: "admin-finances", icon: Wallet, group: "Administrasyon" },
  { label: "Disiplin", view: "admin-discipline", icon: ScrollText },
  { label: "Administratè", view: "admin-admins", icon: Shield },
  { label: "Paramèt", view: "admin-settings", icon: Settings },
];

const PAGE_TITLES: Record<string, string> = {
  "admin-dashboard": "Apèsi Jeneral",
  "admin-teams": "Jesyon Ekip",
  "admin-team-detail": "Detay Ekip",
  "admin-players": "Verifikasyon Jwè",
  "admin-competitions": "Jesyon Konpetisyon",
  "admin-match-control": "Kontwòl Match",
  "admin-replays": "Replay Archive",
  "admin-finances": "Finans",
  "admin-discipline": "Disiplin",
  "admin-admins": "Administratè",
  "admin-settings": "Paramèt",
  standings: "Klasman ofisyèl",
  tv: "FIFAYITI TV",
};

export function AdminShell({ children }: { children: React.ReactNode }) {
  const {
    view,
    setView,
    setAdminAuthed,
    adminRole,
    online,
    pendingSync,
  } = useAppStore();
  const [mobileOpen, setMobileOpen] = useState(false);
  const title = PAGE_TITLES[view] ?? "Administrasyon";

  const logout = () => {
    setAdminAuthed(false);
    setView("home");
  };

  return (
    <div className="min-h-screen flex admin-workspace">
      {/* Sidebar — deep green */}
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
          >
            <X size={20} />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto py-3">
          <div className="px-3 space-y-0.5">
            {NAV.map((item, idx) => {
              const Icon = item.icon;
              const active = view === item.view || (view === "admin-team-detail" && item.view === "admin-teams");
              if (item.group) {
                return (
                  <div key={`${item.label}-${idx}`}>
                    <p className="pt-4 pb-1 px-2 eyebrow text-white/40">
                      {item.group}
                    </p>
                    <NavBtn item={item} active={active} onClick={() => { setView(item.view); setMobileOpen(false); }} />
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

      {/* Mobile backdrop */}
      {mobileOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 md:hidden" onClick={() => setMobileOpen(false)} />
      )}

      {/* Main workspace */}
      <div className="flex-1 md:ml-[248px] flex flex-col min-w-0">
        {/* Top bar — 72px, heading-lg title */}
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

          {/* Competition selector */}
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#F4F7F3]">
            <Trophy size={14} className="text-[#116B3A]" />
            <span className="body-sm font-semibold text-[#084C2A]">FIFAYITI Koup Tikan 2026</span>
          </div>

          {/* Sync indicator */}
          <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#F4F7F3]">
            {online ? (
              <>
                <Cloud size={14} className="text-[#116B3A]" />
                <span className="meta font-semibold text-[#116B3A]">Senkronize</span>
              </>
            ) : (
              <>
                <WifiOff size={14} className="text-[#F4C400]" />
                <span className="meta font-semibold text-[#F4C400]">
                  Offline · <span className="tnum">{pendingSync}</span> an atant
                </span>
              </>
            )}
          </div>

          <button
            className="relative p-2 rounded-lg hover:bg-[#F4F7F3]"
            style={{ minHeight: 44, minWidth: 44 }}
            aria-label="Notifikasyon"
          >
            <Bell size={18} className="text-[#667085]" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#D92D20]" />
          </button>

          {/* Profile */}
          <div className="flex items-center gap-2 pl-2">
            <div className="w-9 h-9 rounded-full bg-[#116B3A] flex items-center justify-center text-white text-xs font-bold">
              {adminRole === "president" ? "PR" : adminRole === "director" ? "DK" : "OP"}
            </div>
            <div className="hidden md:block leading-none">
              <p className="body-sm font-bold text-[#084C2A]">
                {adminRole === "president" ? "Prezidan FIFAYITI" : adminRole === "director" ? "Direktè Konpetisyon" : "Operatè live"}
              </p>
              <p className="meta text-[#667085] mt-0.5">@fifayiti.ht</p>
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 md:p-6 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}

function NavBtn({
  item,
  active,
  onClick,
}: {
  item: { label: string; view: ViewKey; icon: React.ElementType };
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
