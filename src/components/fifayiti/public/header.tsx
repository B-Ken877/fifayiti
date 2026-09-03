"use client";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { BrandMark } from "../brand-mark";
import { useAppStore, type ViewKey } from "@/store/app-store";

const NAV: { label: string; view: ViewKey }[] = [
  { label: "Akèy", view: "home" },
  { label: "Match", view: "match" },
  { label: "Pariaj", view: "betting" },
  { label: "Tounwa", view: "tournament" },
  { label: "Ekip", view: "teams" },
  { label: "Jwè", view: "players" },
  { label: "Klasman", view: "standings" },
  { label: "Replay", view: "replays" },
];

export function PublicHeader() {
  const { view, setView, setMobileNavOpen } = useAppStore();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 bg-[#084C2A] text-white border-b border-fifayiti-line">
      <div className="max-w-[1280px] mx-auto px-4 lg:px-6">
        <div className="flex items-center justify-between" style={{ height: 76 }}>
          <button
            onClick={() => setView("home")}
            className="flex items-center cursor-pointer text-left"
            aria-label="FIFAYITI Akèy"
          >
            <BrandMark size="md" variant="white" />
          </button>

          <nav className="hidden md:flex items-center gap-0">
            {NAV.map((item) => {
              const active = view === item.view;
              return (
                <button
                  key={item.view}
                  onClick={() => setView(item.view)}
                  className={cn(
                    "relative px-3.5 py-2 text-sm font-semibold transition-colors",
                    active ? "text-white" : "text-white/65 hover:text-white"
                  )}
                  style={{ minHeight: 40 }}
                >
                  {item.label}
                  {active && (
                    <span
                      className="absolute left-3.5 right-3.5 -bottom-[1px] h-[3px] rounded-full"
                      style={{ background: "#F4C400" }}
                    />
                  )}
                </button>
              );
            })}
          </nav>

          <button
            className="md:hidden inline-flex items-center justify-center rounded-lg p-2 text-white"
            style={{ minWidth: 44, minHeight: 44 }}
            aria-label="Menu"
            onClick={() => {
              setOpen(true);
              setMobileNavOpen(true);
            }}
          >
            <Menu size={22} />
          </button>
        </div>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <div className="absolute top-0 left-0 right-0 bg-[#084C2A] shadow-2xl border-b border-fifayiti-line">
            <div className="flex items-center justify-between px-4" style={{ height: 64 }}>
              <BrandMark size="sm" variant="white" />
              <button
                className="inline-flex items-center justify-center rounded-lg p-2 text-white"
                style={{ minWidth: 44, minHeight: 44 }}
                onClick={() => setOpen(false)}
                aria-label="Fèmen"
              >
                <X size={22} />
              </button>
            </div>
            <nav className="flex flex-col p-4 gap-1">
              {NAV.map((item) => (
                <button
                  key={item.view}
                  onClick={() => {
                    setView(item.view);
                    setOpen(false);
                  }}
                  className={cn(
                    "text-left px-4 py-3 rounded-lg text-base font-semibold",
                    view === item.view
                      ? "text-[#084C2A] bg-[#F4C400]"
                      : "text-white hover:bg-white/5"
                  )}
                  style={{ minHeight: 44 }}
                >
                  {item.label}
                </button>
              ))}
            </nav>
          </div>
        </div>
      )}
    </header>
  );
}
