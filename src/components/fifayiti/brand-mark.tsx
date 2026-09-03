"use client";
import { cn } from "@/lib/utils";

type BrandVariant = "primary" | "white" | "dark";
type BrandSize = "sm" | "md" | "lg" | "compact" | "mark";

interface BrandMarkProps {
  size?: BrandSize;
  showWordmark?: boolean;
  showTagline?: boolean;
  variant?: BrandVariant;
  className?: string;
}

/**
 * FIFAYITI Brand Mark — the standard ⚽ soccer ball emoji + wordmark.
 *
 * The ball is rendered as the Unicode character U+26BD (⚽) — the same
 * icon users see in their emoji keyboard. No custom SVG; we just resize
 * it via the font-size.
 *
 * Variants only affect the WORDMARK color:
 *  - primary → dark-green wordmark (on white backgrounds, e.g. admin login)
 *  - white   → white wordmark (on green/dark backgrounds, e.g. public header)
 *  - dark    → white wordmark (alias of white)
 *
 * Sizes:
 *  - mark     → ball only (32px) — no wordmark
 *  - sm       → 28px ball + small wordmark (mobile)
 *  - md       → 40px ball + wordmark (default)
 *  - lg       → 52px ball + large wordmark (hero)
 *  - compact  → 28px ball + tight wordmark (admin sidebar)
 */
export function BrandMark({
  size = "md",
  showWordmark = true,
  showTagline = true,
  variant = "primary",
  className,
}: BrandMarkProps) {
  const dims: Record<BrandSize, { logo: number; title: number; sub: number }> = {
    mark:     { logo: 32, title: 0,  sub: 0 },
    sm:       { logo: 28, title: 18, sub: 9 },
    compact:  { logo: 28, title: 16, sub: 8 },
    md:       { logo: 40, title: 22, sub: 10 },
    lg:       { logo: 52, title: 30, sub: 12 },
  };
  const { logo: dim, title: titleSize, sub: subSize } = dims[size];

  // Wordmark colors (variant-dependent)
  const fg = variant === "primary" ? "#084C2A" : "#FFFFFF";
  const subFg =
    variant === "primary" ? "rgba(8,76,42,0.65)"
    : "rgba(255,255,255,0.78)";

  const showWords = showWordmark && size !== "mark" && titleSize > 0;

  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      {/* ────────── ⚽ Soccer ball emoji ────────── */}
      <span
        aria-hidden
        className="shrink-0 leading-none select-none"
        style={{
          fontSize: dim,
          lineHeight: 1,
          // Disable any font-feature that might alter emoji rendering
          fontVariantEmoji: "emoji",
          // Ensure the emoji renders as colored emoji (not as text)
          WebkitFontSmoothing: "antialiased",
        }}
      >
        ⚽
      </span>

      {/* ────────── Wordmark ────────── */}
      {showWords && (
        <div className="flex flex-col leading-none text-left">
          <span
            className="font-extrabold tracking-tight"
            style={{
              fontSize: titleSize,
              color: fg,
              letterSpacing: "-0.02em",
              fontFamily: "var(--font-archivo), var(--font-manrope), sans-serif",
            }}
          >
            FIFAYITI
          </span>
          {showTagline && (
            <span
              className="font-medium tracking-wide mt-0.5"
              style={{
                fontSize: subSize,
                color: subFg,
                letterSpacing: "0.04em",
                fontFamily: "var(--font-manrope), sans-serif",
              }}
            >
              Federation Inter Football Ayiti
            </span>
          )}
        </div>
      )}
    </div>
  );
}
