import fs from "node:fs";
import path from "node:path";
import type { CanonicalVenue, ScoreRecord } from "../schema/models.ts";
import type { ReviewEvidenceArtifactMap } from "./rankSearchResults.ts";

type SearchDataKind = "venues" | "scores" | "evidence";

type SearchDataDiagnostics = {
  venuesLoaded: number;
  scoresLoaded: number;
  reviewEvidenceLoaded: number;
  resolvedRoot: string;
  resolvedPaths: Record<SearchDataKind, string>;
  attemptedRoots: string[];
};

export class SearchDataLoadError extends Error {
  readonly details: SearchDataDiagnostics;

  constructor(message: string, details: SearchDataDiagnostics) {
    super(message);
    this.name = "SearchDataLoadError";
    this.details = details;
  }
}

const readJson = <T>(filePath: string): T => JSON.parse(fs.readFileSync(filePath, "utf8")) as T;

const unique = (values: string[]): string[] => [...new Set(values.map((value) => path.resolve(value)))];

const candidateRoots = (): string[] => {
  const roots: string[] = [];
  let cursor = process.cwd();
  for (let i = 0; i < 10; i += 1) {
    roots.push(cursor);
    const next = path.dirname(cursor);
    if (next === cursor) break;
    cursor = next;
  }

  return unique(roots);
};

const resolveDataRoot = (): { root: string | null; attemptedRoots: string[] } => {
  const attempts = candidateRoots();

  for (const root of attempts) {
    const venuesDir = path.join(root, "data/processed/venues");
    const scoresDir = path.join(root, "data/processed/scores");
    if (fs.existsSync(venuesDir) && fs.existsSync(scoresDir)) {
      return { root, attemptedRoots: attempts };
    }
  }

  return { root: null, attemptedRoots: attempts };
};

const listJsonFiles = (dir: string, suffix: string): string[] => {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((file) => file.endsWith(suffix)).sort();
};

export const loadSearchData = () => {
  const { root, attemptedRoots } = resolveDataRoot();

  const fallbackRoot = attemptedRoots[0] ?? process.cwd();
  const resolvedRoot = root ?? fallbackRoot;
  const resolvedPaths = {
    venues: path.join(resolvedRoot, "data/processed/venues"),
    scores: path.join(resolvedRoot, "data/processed/scores"),
    evidence: path.join(resolvedRoot, "data/processed/evidence"),
  } satisfies Record<SearchDataKind, string>;

  if (!root) {
    throw new SearchDataLoadError("Search dataset directories not found.", {
      venuesLoaded: 0,
      scoresLoaded: 0,
      reviewEvidenceLoaded: 0,
      resolvedRoot,
      resolvedPaths,
      attemptedRoots,
    });
  }

  const venues = listJsonFiles(resolvedPaths.venues, ".canonical.json").map((file) => readJson<CanonicalVenue>(path.join(resolvedPaths.venues, file)));

  const scores = new Map<string, ScoreRecord>();
  for (const file of listJsonFiles(resolvedPaths.scores, ".score.json")) {
    const score = readJson<ScoreRecord>(path.join(resolvedPaths.scores, file));
    scores.set(score.venue_id, score);
  }

  const reviewEvidence: ReviewEvidenceArtifactMap = {};
  for (const file of listJsonFiles(resolvedPaths.evidence, ".reviews.evidence.json")) {
    const artifact = readJson<{ venue_id: string; source: string; review_count: number; signals: Array<{ signal: string; sentiment: number; confidence: number; evidence: string }> }>(path.join(resolvedPaths.evidence, file));
    reviewEvidence[artifact.venue_id] = artifact;
  }

  const diagnostics: SearchDataDiagnostics = {
    venuesLoaded: venues.length,
    scoresLoaded: scores.size,
    reviewEvidenceLoaded: Object.keys(reviewEvidence).length,
    resolvedRoot,
    resolvedPaths,
    attemptedRoots,
  };

  if (venues.length === 0 || scores.size === 0) {
    throw new SearchDataLoadError("Search dataset files are missing or empty.", diagnostics);
  }

  return { venues, scores, reviewEvidence, diagnostics };
};

export type { SearchDataDiagnostics };
