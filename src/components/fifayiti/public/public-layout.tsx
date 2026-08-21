"use client";
import { useAppStore } from "@/store/app-store";
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
import { BottomNav } from "./bottom-nav";

export function PublicLayout() {
  const { view } = useAppStore();

  if (view.startsWith("admin-")) {
    return null;
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
