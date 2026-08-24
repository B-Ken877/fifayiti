"use client";
import { Home, Trophy, Users, BarChart3, Film, Megaphone } from "lucide-react";
import { useAppStore, type ViewKey } from "@/store/app-store";
import { cn } from "@/lib/utils";

const ITEMS: { icon: React.ElementType; label: string; view: ViewKey }[] = [
  { icon: Home, label: "Akèy", view: "home" },
  { icon: Megaphone, label: "Match", view: "match" },
  { icon: Trophy, label: "Tounwa", view: "tournament" },
  { icon: Users, label: "Ekip", view: "teams" },
  { icon: BarChart3, label: "Klasman", view: "standings" },
];

export function BottomNav() {
  const { view, setView } = useAppStore();
  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-[#084C2A] border-t border-fifayiti-line"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Navigasyon mobil"
    >
      <div className="grid grid-cols-5">
        {ITEMS.map((item) => {
          const Icon = item.icon;
          const active =
            view === item.view ||
            (item.view === "teams" && (view === "team-detail" || view === "players"));
          return (
            <button
              key={item.view}
              onClick={() => setView(item.view)}
              className={cn(
                "relative flex flex-col items-center justify-center gap-1 py-2 text-[10px] font-semibold transition-colors",
                active ? "text-[#F4C400]" : "text-white/55"
              )}
              style={{ minHeight: 56 }}
              aria-current={active ? "page" : undefined}
            >
              {active && (
                <span
                  className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-[3px] rounded-full"
                  style={{ background: "#F4C400" }}
                />
              )}
              <Icon
                size={22}
                strokeWidth={active ? 2.5 : 2}
                fill={active ? "#F4C400" : "none"}
              />
              {item.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
