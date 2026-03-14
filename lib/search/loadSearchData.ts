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

const readJsonSafe = <T>(filePath: string): T | null => {
  try {
    return readJson<T>(filePath);
  } catch (error) {
    console.warn("[search:data] failed to parse JSON artifact", {
      filePath,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
};

const unique = (values: string[]): string[] => [...new Set(values.map((value) => path.resolve(value)))];

const candidateRoots = (): string[] => {
  const cwd = process.cwd();
  return unique([
    cwd,
    path.resolve(cwd, ".."),
    path.resolve(cwd, "../.."),
    path.resolve(cwd, "../../.."),
    path.resolve("/var/task"),
    path.resolve("/var/task/site"),
    path.resolve("/opt/build/repo"),
  ].filter((value): value is string => typeof value === "string" && value.length > 0));
};

const resolveDataRoot = (): { root: string | null; attemptedRoots: string[]; attemptedVenueDirs: string[] } => {
  const attempts = candidateRoots();
  const attemptedVenueDirs = attempts.map((root) => path.join(root, "data/processed/venues"));

  for (const [index, root] of attempts.entries()) {
    const venuesDir = attemptedVenueDirs[index];
    if (fs.existsSync(venuesDir)) {
      return { root, attemptedRoots: attempts, attemptedVenueDirs };
    }
  }

  return { root: null, attemptedRoots: attempts, attemptedVenueDirs };
};

const listJsonFiles = (dir: string, suffix: string): string[] => {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((file) => file.endsWith(suffix)).sort();
};

export const loadSearchData = () => {
  const { root, attemptedRoots, attemptedVenueDirs } = resolveDataRoot();

  const fallbackRoot = attemptedRoots[0] ?? process.cwd();
  const resolvedRoot = root ?? fallbackRoot;
  const resolvedPaths = {
    venues: path.join(resolvedRoot, "data/processed/venues"),
    scores: path.join(resolvedRoot, "data/processed/scores"),
    evidence: path.join(resolvedRoot, "data/processed/evidence"),
  } satisfies Record<SearchDataKind, string>;

  if (!root) {
    console.error("[search:data] failed to resolve data root", {
      attemptedRoots,
      attemptedVenueDirs,
    });
    throw new SearchDataLoadError("Search dataset directories not found.", {
      venuesLoaded: 0,
      scoresLoaded: 0,
      reviewEvidenceLoaded: 0,
      resolvedRoot,
      resolvedPaths,
      attemptedRoots,
    });
  }

  const venues: CanonicalVenue[] = [];
  for (const file of listJsonFiles(resolvedPaths.venues, ".canonical.json")) {
    const venue = readJsonSafe<CanonicalVenue>(path.join(resolvedPaths.venues, file));
    if (venue) venues.push(venue);
  }

  const scores = new Map<string, ScoreRecord>();
  for (const file of listJsonFiles(resolvedPaths.scores, ".score.json")) {
    const score = readJsonSafe<ScoreRecord>(path.join(resolvedPaths.scores, file));
    if (!score) continue;
    scores.set(score.venue_id, score);
  }

  const reviewEvidence: ReviewEvidenceArtifactMap = {};
  for (const file of listJsonFiles(resolvedPaths.evidence, ".reviews.evidence.json")) {
    const artifact = readJsonSafe<{ venue_id: string; source: string; review_count: number; signals: Array<{ signal: string; sentiment: number; confidence: number; evidence: string }> }>(path.join(resolvedPaths.evidence, file));
    if (!artifact) continue;
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

  if (venues.length === 0) {
    throw new SearchDataLoadError("Search dataset files are missing or empty.", diagnostics);
  }

  return { venues, scores, reviewEvidence, diagnostics };
};

export type { SearchDataDiagnostics };
