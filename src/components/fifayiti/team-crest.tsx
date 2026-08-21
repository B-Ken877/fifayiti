"use client";
import { cn } from "@/lib/utils";

interface TeamCrestProps {
  teamId: string;
  shortName: string;
  primary: string;
  secondary: string;
  size?: "xs" | "sm" | "md" | "lg" | "hero";
  className?: string;
}

/**
 * TeamCrest — neutral FIFAYITI-generated crest system.
 * Every team gets the same hexagonal crest with its own brand colors.
 * Sizes: xs (24), sm (32), md (44), lg (60), hero (96).
 * Does NOT falsely present itself as an official club logo.
 */
export function TeamCrest({ shortName, primary, secondary, size = "md", className }: TeamCrestProps) {
  const dim = size === "xs" ? 24 : size === "sm" ? 32 : size === "md" ? 44 : size === "lg" ? 60 : 96;
  const fontSize = dim * (size === "hero" ? 0.22 : 0.28);
  const subNum = shortName.split(" ")[1] || "";

  return (
    <div
      className={cn("relative flex items-center justify-center shrink-0", className)}
      style={{ width: dim, height: dim }}
      aria-label={`Krest ${shortName}`}
    >
      <svg
        width={dim}
        height={dim}
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
      >
        {/* Outer hexagon — team primary color */}
        <path d="M24 2 L42 13 V35 L24 46 L6 35 V13 Z" fill={primary} />
        {/* Inner hexagon outline — secondary color */}
        <path
          d="M24 7 L37 15 V33 L24 41 L11 33 V15 Z"
          fill="none"
          stroke={secondary}
          strokeWidth="1.4"
          opacity="0.65"
        />
      </svg>
      {/* Center number — team identifier */}
      <span
        className="absolute font-extrabold"
        style={{
          color: secondary,
          fontSize,
          fontFamily: "var(--font-archivo), var(--font-manrope), sans-serif",
          letterSpacing: "-0.02em",
        }}
      >
        {subNum}
      </span>
    </div>
  );
}
