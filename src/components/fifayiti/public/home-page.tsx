"use client";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, CalendarDays, Goal, Medal, Trophy, Users } from "lucide-react";
import { useAppStore } from "@/store/app-store";
import { TeamCrest } from "../team-crest";
import { cn } from "@/lib/utils";

type Team = { id:string; name:string; shortName:string; primaryColor:string; secondaryColor:string; group:string; players?: {id:string}[] };
type Match = { id:string; matchday:number; competitionId?:string|null; competitionName?:string; homeTeamId:string; awayTeamId:string; homeScore:number; awayScore:number; kickoff:string; venue?:string|null; status:string };
type Competition = { id:string; name:string; season:string };
type RecordRow = { team:Team; played:number; won:number; drawn:number; lost:number; gf:number; ga:number; points:number };
const dateText=(value:string)=>{const d=new Date(value);return Number.isNaN(d.getTime())?"":d.toLocaleDateString("fr-HT",{weekday:"short",day:"numeric",month:"short"});};
const timeText=(value:string)=>{const d=new Date(value);return Number.isNaN(d.getTime())?"":d.toLocaleTimeString("fr-HT",{hour:"2-digit",minute:"2-digit"});};

export function HomePage() {
  const {setView,setActiveMatchId,setActiveTeamId}=useAppStore();
  const [matches,setMatches]=useState<Match[]>([]);
  const [teams,setTeams]=useState<Team[]>([]);
  const [competition,setCompetition]=useState<Competition|null>(null);
  const [loading,setLoading]=useState(true);
  const [updatedAt,setUpdatedAt]=useState<Date|null>(null);

  useEffect(()=>{
    let cancelled=false;
    const load=async()=>{
      try {
        const [mr,tr,cr]=await Promise.all([
          fetch("/api/matches",{cache:"no-store"}),fetch("/api/teams",{cache:"no-store"}),fetch("/api/competitions/active",{cache:"no-store"})
        ]);
        if(!mr.ok||!tr.ok||!cr.ok) throw new Error("load failed");
        const [m,t,c]=await Promise.all([mr.json(),tr.json(),cr.json()]);
        if(cancelled)return;
        setMatches(m.matches??[]);setTeams(t.teams??[]);setCompetition(c.competition??null);setUpdatedAt(new Date());
      } catch {} finally {if(!cancelled)setLoading(false);}
    };
    load();const timer=window.setInterval(load,30000);
    const refresh=()=>{if(document.visibilityState==="visible")load();};
    document.addEventListener("visibilitychange",refresh);
    return()=>{cancelled=true;window.clearInterval(timer);document.removeEventListener("visibilitychange",refresh);};
  },[]);

  const activeMatches=useMemo(()=>{
    if(!competition?.id)return matches;
    const scoped=matches.filter(m=>m.competitionId===competition.id);
    return scoped.length?scoped:matches;
  },[matches,competition]);
  const records=useMemo(()=>{
    const map=new Map<string,RecordRow>();
    teams.forEach(team=>map.set(team.id,{team,played:0,won:0,drawn:0,lost:0,gf:0,ga:0,points:0}));
    activeMatches.filter(m=>m.status==="FINI").forEach(m=>{
      const h=map.get(m.homeTeamId),a=map.get(m.awayTeamId);if(!h||!a)return;
      h.played++;a.played++;h.gf+=m.homeScore;h.ga+=m.awayScore;a.gf+=m.awayScore;a.ga+=m.homeScore;
      if(m.homeScore>m.awayScore){h.won++;a.lost++;h.points+=3;}
      else if(m.homeScore<m.awayScore){a.won++;h.lost++;a.points+=3;}
      else{h.drawn++;a.drawn++;h.points++;a.points++;}
    });
    return [...map.values()].sort((a,b)=>b.points-a.points||(b.gf-b.ga)-(a.gf-a.ga)||b.gf-a.gf||a.team.name.localeCompare(b.team.name));
  },[teams,activeMatches]);
  const teamById=(id:string)=>teams.find(t=>t.id===id);
  const live=activeMatches.find(m=>m.status==="AN_DIRÈK")??null;
  const upcoming=activeMatches.filter(m=>m.status==="PWOGRAM").sort((a,b)=>Date.parse(a.kickoff)-Date.parse(b.kickoff));
  const finished=activeMatches.filter(m=>m.status==="FINI").sort((a,b)=>Date.parse(b.kickoff)-Date.parse(a.kickoff));
  const goals=finished.reduce((n,m)=>n+m.homeScore+m.awayScore,0);
  const players=teams.reduce((n,t)=>n+(t.players?.length??0),0);
  const topAttack=records.filter(r=>r.played>0).sort((a,b)=>b.gf-a.gf).slice(0,4);
  const openMatch=(id:string)=>{setActiveMatchId(id);setView("match");};

  if(loading)return <div className="min-h-[60vh] flex items-center justify-center bg-[#064E2A]"><div className="h-9 w-9 rounded-full border-2 border-[#F4C400] border-t-transparent animate-spin"/></div>;

  return <div className="min-h-screen bg-[#F4F7F3] text-[#101828]">
    <section className="bg-pitch-texture-dark bg-[#064E2A] text-white">
      <div className="max-w-[1280px] mx-auto px-4 lg:px-6 py-10 lg:py-14">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.16em] text-[#F4C400]"><Trophy size={15}/>{competition?.name??"FIFAYITI"}{competition?.season&&<span className="text-white/55">· {competition.season}</span>}</div>
        <div className="mt-4 flex flex-col md:flex-row md:items-end md:justify-between gap-5">
          <div><h1 className="text-3xl lg:text-5xl font-extrabold tracking-tight">Chanpyona a, tout an chif.</h1><p className="mt-3 text-sm lg:text-base text-white/70">Swiv rezilta, klasman, ekip ak pwochen match yo nan yon sèl kote.</p></div>
          {updatedAt&&<p className="text-xs text-white/55">Mizajou {updatedAt.toLocaleTimeString("fr-HT",{hour:"2-digit",minute:"2-digit"})}</p>}
        </div>
        <div className="mt-8 grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            {label:"Ekip",value:teams.length,icon:Users},{label:"Jwè anrejistre",value:players,icon:Users},
            {label:"Match fini",value:finished.length,icon:CalendarDays},{label:"Gòl make",value:goals,icon:Goal}
          ].map(({label,value,icon:Icon})=><div key={label} className="rounded-xl border border-white/10 bg-black/15 p-4 lg:p-5">
            <div className="flex justify-between text-white/55"><span className="text-xs font-semibold">{label}</span><Icon size={17}/></div>
            <p className="mt-2 text-3xl font-extrabold tabular-nums">{value.toLocaleString("fr-HT")}</p>
          </div>)}
        </div>
      </div>
    </section>
    {live&&<section className="bg-[#F4C400]"><div className="max-w-[1280px] mx-auto px-4 py-3 flex justify-between items-center gap-3">
      <span className="text-xs font-extrabold uppercase text-[#064E2A]"><span className="inline-block h-2 w-2 rounded-full bg-red-600 animate-pulse mr-2"/>Match ap dewoule kounye a</span>
      <button onClick={()=>openMatch(live.id)} className="flex items-center gap-2 text-sm font-bold text-[#064E2A]">{teamById(live.homeTeamId)?.shortName??"?"} {live.homeScore} — {live.awayScore} {teamById(live.awayTeamId)?.shortName??"?"}<ArrowRight size={16}/></button>
    </div></section>}
    <main className="max-w-[1280px] mx-auto px-4 lg:px-6 py-8 space-y-8">
      <section className="grid lg:grid-cols-[1.2fr_.8fr] gap-6">
        <div className="rounded-2xl bg-white border border-[#E4E7EC] p-5 lg:p-7">
          <div className="flex justify-between items-center mb-5"><div><p className="text-xs font-bold uppercase text-[#667085]">Klasman ofisyèl</p><h2 className="mt-1 text-xl font-extrabold text-[#064E2A]">Kijan ekip yo kanpe</h2></div><button onClick={()=>setView("standings")} className="text-xs font-bold text-[#116B3A]">Tout klasman <ArrowRight size={13} className="inline"/></button></div>
          {!records.length?<Empty text="Pa gen ekip nan chanpyona a poko."/>:<div className="overflow-x-auto"><table className="w-full min-w-[560px]">
            <thead><tr className="border-b text-[10px] uppercase text-[#667085]"><th className="py-2 text-left">#</th><th className="py-2 text-left">Ekip</th><th>J</th><th>G</th><th>N</th><th>P</th><th>GF</th><th>GA</th><th>DG</th><th className="text-right">PTS</th></tr></thead>
            <tbody>{records.slice(0,8).map((r,i)=><tr key={r.team.id} onClick={()=>{setActiveTeamId(r.team.id);setView("team-detail");}} className="border-b last:border-0 hover:bg-[#F8F9FA] cursor-pointer">
              <td className="py-3"><span className={cn("inline-flex w-6 h-6 items-center justify-center rounded text-xs font-bold",i===0?"bg-[#F4C400] text-[#064E2A]":"text-[#667085]")}>{i+1}</span></td>
              <td><span className="flex items-center gap-2"><TeamCrest teamId={r.team.id} shortName={r.team.shortName} primary={r.team.primaryColor} secondary={r.team.secondaryColor} size="xs"/><span className="text-xs font-bold">{r.team.name}</span></span></td>
              <td className="text-center text-xs">{r.played}</td><td className="text-center text-xs">{r.won}</td><td className="text-center text-xs">{r.drawn}</td><td className="text-center text-xs">{r.lost}</td>
              <td className="text-center text-xs">{r.gf}</td><td className="text-center text-xs">{r.ga}</td><td className="text-center text-xs">{r.gf-r.ga}</td><td className="text-right font-extrabold">{r.points}</td>
            </tr>)}</tbody>
          </table></div>}
        </div>
        <div className="rounded-2xl bg-white border border-[#E4E7EC] p-5 lg:p-7">
          <div className="flex items-center justify-between mb-5"><div><p className="text-xs font-bold uppercase text-[#667085]">Pi bon atak</p><h2 className="mt-1 text-xl font-extrabold text-[#064E2A]">Gòl pa ekip</h2></div><Medal className="text-[#C69200]" size={22}/></div>
          {!topAttack.length?<Empty text="Done sou gòl yo ap parèt apre premye match la."/>:<ol className="space-y-2.5">{topAttack.map((r,i)=><li key={r.team.id} className="flex items-center gap-3 rounded-lg bg-[#F8F9FA] px-3 py-2.5">
            <span className={cn("w-6 h-6 rounded flex items-center justify-center text-xs font-bold",i===0?"bg-[#F4C400] text-[#064E2A]":"bg-[#E4E7EC]")}>{i+1}</span>
            <TeamCrest teamId={r.team.id} shortName={r.team.shortName} primary={r.team.primaryColor} secondary={r.team.secondaryColor} size="xs"/>
            <span className="min-w-0 flex-1 truncate text-sm font-semibold">{r.team.name}</span><b>{r.gf} GF</b>
          </li>)}</ol>}
          <button onClick={()=>setView("teams")} className="mt-4 text-xs font-bold text-[#116B3A]">Dekouvri ekip yo <ArrowRight size={13} className="inline"/></button>
        </div>
      </section>
      <section className="grid lg:grid-cols-2 gap-6">
        <MatchList title="Pwochen match yo" matches={upcoming.slice(0,4)} teamById={teamById} openMatch={openMatch} upcoming onAll={()=>setView("tournament")}/>
        <MatchList title="Dènye rezilta" matches={finished.slice(0,4)} teamById={teamById} openMatch={openMatch} onAll={()=>setView("match")}/>
      </section>
      <section className="rounded-2xl bg-[#064E2A] text-white p-5 lg:p-7">
        <div className="flex justify-between items-end"><div><p className="text-xs font-bold uppercase text-[#F4C400]">Kominote a</p><h2 className="mt-1 text-xl font-extrabold">Ekip FIFAYITI</h2></div><button onClick={()=>setView("players")} className="text-xs font-bold text-[#F4C400]">Tout jwè yo <ArrowRight size={13} className="inline"/></button></div>
        {!teams.length?<p className="mt-5 text-sm text-white/60">Pa gen ekip ki anrejistre poko.</p>:<div className="mt-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">{teams.slice(0,6).map(team=><button key={team.id} onClick={()=>{setActiveTeamId(team.id);setView("team-detail");}} className="rounded-xl border border-white/10 bg-white/5 p-3 text-left hover:bg-white/10">
          <TeamCrest teamId={team.id} shortName={team.shortName} primary={team.primaryColor} secondary={team.secondaryColor} size="sm"/><p className="mt-2 truncate text-xs font-bold">{team.name}</p><p className="text-[10px] text-white/55">{team.players?.length??0} jwè · Gwoup {team.group}</p>
        </button>)}</div>}
      </section>
    </main>
  </div>;
}

function MatchList({title,matches,teamById,openMatch,onAll,upcoming=false}:{title:string;matches:Match[];teamById:(id:string)=>Team|undefined;openMatch:(id:string)=>void;onAll:()=>void;upcoming?:boolean}) {
  return <div className="rounded-2xl bg-white border border-[#E4E7EC] p-5 lg:p-7">
    <div className="flex justify-between items-center mb-5"><h2 className="text-xl font-extrabold text-[#064E2A]">{title}</h2><button onClick={onAll} className="text-xs font-bold text-[#116B3A]">Tout wè <ArrowRight size={13} className="inline"/></button></div>
    {!matches.length?<Empty text={upcoming?"Pa gen match pwograme pou kounye a.":"Rezilta yo ap parèt apre premye siflèt final la."}/>:<div className="space-y-2">{matches.map(match=>{
      const home=teamById(match.homeTeamId),away=teamById(match.awayTeamId);
      return <button key={match.id} onClick={()=>openMatch(match.id)} className="w-full rounded-xl border border-[#E4E7EC] bg-[#F8F9FA] p-3 text-left hover:border-[#F4C400]">
        <div className="flex justify-between text-[10px] text-[#667085]"><span>{match.competitionName??"FIFAYITI"} · Jounen {match.matchday}</span><span><CalendarDays size={11} className="inline"/> {dateText(match.kickoff)} {upcoming&&timeText(match.kickoff)}</span></div>
        <div className="mt-3 flex justify-between items-center gap-2">
          <span className="flex min-w-0 items-center gap-2"><TeamCrest teamId={home?.id??""} shortName={home?.shortName??"?"} primary={home?.primaryColor??"#116B3A"} secondary={home?.secondaryColor??"#F4C400"} size="xs"/><span className="truncate text-xs font-bold">{home?.name??"Ekip lakay"}</span></span>
          <b className="shrink-0 text-sm">{upcoming?"VS":match.homeScore+" — "+match.awayScore}</b>
          <span className="flex min-w-0 items-center gap-2"><span className="truncate text-xs font-bold">{away?.name??"Ekip vizitè"}</span><TeamCrest teamId={away?.id??""} shortName={away?.shortName??"?"} primary={away?.primaryColor??"#116B3A"} secondary={away?.secondaryColor??"#F4C400"} size="xs"/></span>
        </div>
        {match.venue&&<p className="mt-2 text-[10px] text-[#667085]">{match.venue}</p>}
      </button>;
    })}</div>}
  </div>;
}
function Empty({text}:{text:string}) { return <p className="rounded-xl bg-[#F8F9FA] px-4 py-6 text-center text-sm text-[#667085]">{text}</p>; }
