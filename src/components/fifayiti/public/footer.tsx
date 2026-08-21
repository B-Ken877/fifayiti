"use client";
import { BrandMark } from "../brand-mark";
import { useAppStore, type ViewKey } from "@/store/app-store";

const LINKS: { label: string; view: ViewKey }[] = [
  { label: "Akèy", view: "home" },
  { label: "Match", view: "match" },
  { label: "Ekip", view: "teams" },
  { label: "Jwè", view: "players" },
  { label: "Klasman", view: "standings" },
  { label: "FIFAYITI TV", view: "tv" },
];

export function PublicFooter() {
  const { setView } = useAppStore();
  return (
    <footer className="mt-auto bg-[#053319] text-white">
      <div className="max-w-[1280px] mx-auto px-4 lg:px-6 py-12 lg:py-16">
        <div className="grid grid-cols-1 md:grid-cols-[1.4fr_1fr_1fr] gap-10 lg:gap-16">
          {/* Brand */}
          <div className="space-y-5">
            <BrandMark size="md" variant="white" />
            <p className="body-sm text-white/65 max-w-sm leading-relaxed">
              Senp pou moun yo. Pwofesyonèl pou FIFAYITI. Football Ayiti a ap viv.
            </p>
          </div>

          {/* Navigation */}
          <div>
            <p className="eyebrow text-[#F4C400] mb-4">Navigasyon</p>
            <ul className="grid grid-cols-2 gap-y-2 gap-x-4">
              {LINKS.map((l) => (
                <li key={l.view}>
                  <button
                    onClick={() => setView(l.view)}
                    className="body-sm text-white/80 hover:text-white transition-colors"
                  >
                    {l.label}
                  </button>
                </li>
              ))}
            </ul>
            {/* Discreet admin entry — visually subordinate */}
            <div className="mt-6 pt-4 border-t border-fifayiti-line">
              <button
                onClick={() => setView("admin-login")}
                className="meta text-white/45 hover:text-white/70 transition-colors"
              >
                Administrasyon
              </button>
            </div>
          </div>

          {/* Federation info — real, no placeholders */}
          <div>
            <p className="eyebrow text-[#F4C400] mb-4">Federasyon</p>
            <ul className="space-y-2 body-sm text-white/80">
              <li>FIFAYITI — Federation Inter Football Ayiti</li>
              <li className="text-white/65">Delmas, Port-au-Prince, Ayiti</li>
              <li className="meta text-white/40 pt-2">
                Kounye a: premye edisyon FIFAYITI 2026
              </li>
            </ul>
            <p className="meta text-white/40 mt-6">
              © 2026 FIFAYITI — Tout dwa rezève.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
