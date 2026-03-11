import fs from "fs";
import path from "path";
import {
  getBestContrastTherapyVenues,
  getBestSocialSaunas,
  getTopBathhousesWorldwide,
  rankVenues,
} from "../../lib/ranking/rankings";
import { CanonicalVenue, ScoreRecord } from "../../lib/schema/models";

type RankingsOutput = {
  top_bathhouses_worldwide: Array<{ slug: string; name: string; city: string; overall: number; confidence_score: number }>;
  best_social_saunas: Array<{ slug: string; name: string; city: string; social_energy: number; confidence_score: number }>;
  best_contrast_therapy_venues: Array<{ slug: string; name: string; city: string; overall: number; confidence_score: number }>;
};

const readJson = <T>(filePath: string): T => JSON.parse(fs.readFileSync(filePath, "utf8")) as T;

const readDirJson = <T>(dirPath: string, suffix: string): T[] =>
  fs.readdirSync(dirPath)
    .filter((name) => name.endsWith(suffix))
    .sort()
    .map((file) => readJson<T>(path.resolve(dirPath, file)));

export function generateRankings(venues: CanonicalVenue[], scores: ScoreRecord[], limit = 10): RankingsOutput {
  const topWorldwide = getTopBathhousesWorldwide(venues, scores, limit).map(({ venue, score }) => ({
    slug: venue.slug,
    name: venue.name,
    city: venue.city,
    overall: score.overall,
    confidence_score: score.confidence_score,
  }));

  const socialSaunas = getBestSocialSaunas(venues, scores, limit).map(({ venue, score }) => ({
    slug: venue.slug,
    name: venue.name,
    city: venue.city,
    social_energy: score.social_energy,
    confidence_score: score.confidence_score,
  }));

  const contrastTherapy = getBestContrastTherapyVenues(venues, scores, limit).map(({ venue, score }) => ({
    slug: venue.slug,
    name: venue.name,
    city: venue.city,
    overall: score.overall,
    confidence_score: score.confidence_score,
  }));

  return {
    top_bathhouses_worldwide: topWorldwide,
    best_social_saunas: socialSaunas,
    best_contrast_therapy_venues: contrastTherapy,
  };
}

export function generateCustomRanking(
  venues: CanonicalVenue[],
  scores: ScoreRecord[],
  limit = 10,
  filters: Parameters<typeof rankVenues>[2] = {}
) {
  return rankVenues(venues, scores, filters, limit).map(({ venue, score }) => ({
    slug: venue.slug,
    name: venue.name,
    city: venue.city,
    country: venue.country,
    overall: score.overall,
    confidence_score: score.confidence_score,
    coverage_score: score.coverage_score,
  }));
}

if (require.main === module) {
  const [venuesDir = "data/processed/venues", scoresDir = "data/processed/scores", outputPath = "data/processed/rankings.sample.json"] = process.argv.slice(2);

  const venues = readDirJson<CanonicalVenue>(path.resolve(venuesDir), ".canonical.json");
  const scores = readDirJson<ScoreRecord>(path.resolve(scoresDir), ".score.json");
  const rankings = generateRankings(venues, scores);

  fs.writeFileSync(path.resolve(outputPath), `${JSON.stringify(rankings, null, 2)}\n`, "utf8");
  process.stdout.write(`Generated ${outputPath}\n`);
}
