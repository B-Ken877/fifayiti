"use client";
import { useAppStore } from "@/store/app-store";
import { cn } from "@/lib/utils";
import { PublicHeader } from "./header";
import { PublicFooter } from "./footer";
import { HomePage } from "./home-page";
import { TvPage } from "../tv/tv-page";
import { MatchPage } from "../match/match-page";
import { TeamsPage } from "./teams-page";
import { TeamDetailPage } from "./team-detail-page";
import { PlayersPage } from "./players-page";
import { StandingsPage } from "./standings-page";
import { TournamentPage } from "./tournament-page";
import { ReplaysPage } from "./replays-page";
import { BettingPage } from "../betting/betting-page";
import { WalletPage } from "../betting/wallet-page";
import { BettorAuthPage } from "../betting/bettor-auth-page";
import { BettingOperatorPage } from "../betting/betting-operator-page";
import { BottomNav } from "./bottom-nav";

export function PublicLayout() {
  const { view } = useAppStore();

  if (view.startsWith("admin-")) {
    return null;
  }

  // Betting views render full-screen with the bottom nav always visible
  // (no public header/footer — betting has its own chrome, but the bottom
  // nav is the primary navigation so it MUST stay).
  // Exception: the auth page is a focused flow (login/register) — hide
  // the bottom nav there so the user isn't distracted mid-flow.
  if (view === "betting" || view === "betting-wallet" || view === "betting-login" || view === "betting-operator") {
    const showNav = view !== "betting-login";
    return (
      <div className="min-h-screen flex flex-col">
        <main className={cn("flex-1", showNav && "pb-24 md:pb-0")}>
          {view === "betting" && <BettingPage />}
          {view === "betting-wallet" && <WalletPage />}
          {view === "betting-login" && <BettorAuthPage />}
          {view === "betting-operator" && <BettingOperatorPage />}
        </main>
        {showNav && <BottomNav />}
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <PublicHeader />
      <main className="flex-1 pb-24 md:pb-0">
        {view === "home" && <HomePage />}
        {view === "tv" && <TvPage />}
        {view === "match" && <MatchPage />}
        {view === "teams" && <TeamsPage />}
        {view === "team-detail" && <TeamDetailPage />}
        {view === "players" && <PlayersPage />}
        {view === "standings" && <StandingsPage />}
        {view === "tournament" && <TournamentPage />}
        {view === "replays" && <ReplaysPage />}
      </main>
      <PublicFooter />
      <BottomNav />
    </div>
  );
}
