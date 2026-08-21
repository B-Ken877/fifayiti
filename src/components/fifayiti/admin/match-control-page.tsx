// Thin re-export — keeps the import in src/app/page.tsx (which imports from
// "@/components/fifayiti/admin/match-control-page") working while the actual
// implementation lives in the decomposed ./match-control subdirectory.
export { MatchControlPage } from "./match-control";
