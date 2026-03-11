import fs from "fs";
import path from "path";
import { EvidenceRecord } from "../../lib/schema/models";
import { validateEvidenceRecord } from "../../lib/schema/validation";

const dedupeKey = (record: EvidenceRecord): string =>
  [record.venue_id, record.claim_type, record.claim_key, String(record.claim_value), record.source_url ?? ""].join("::");

function choosePreferred(a: EvidenceRecord, b: EvidenceRecord): EvidenceRecord {
  if (a.human_verified !== b.human_verified) return a.human_verified ? a : b;
  if (a.confidence !== b.confidence) return a.confidence > b.confidence ? a : b;
  return new Date(a.extracted_at) > new Date(b.extracted_at) ? a : b;
}

export function aggregateEvidence(sources: EvidenceRecord[][]): EvidenceRecord[] {
  const merged = sources.flat();
  const map = new Map<string, EvidenceRecord>();

  merged.forEach((record) => {
    const check = validateEvidenceRecord(record);
    if (!check.valid) {
      throw new Error(`Invalid evidence ${record.id}: ${check.errors.join(", ")}`);
    }

    const key = dedupeKey(record);
    const existing = map.get(key);
    map.set(key, existing ? choosePreferred(existing, record) : record);
  });

  return Array.from(map.values()).sort((a, b) => a.id.localeCompare(b.id));
}

if (require.main === module) {
  const [baseEvidencePath, additionalEvidencePath, outputPath] = process.argv.slice(2);
  if (!baseEvidencePath || !outputPath) {
    throw new Error("Usage: node scripts/ingestion/aggregateEvidence.ts <base-evidence.json> [additional-evidence.json] <output-path>");
  }

  const resolvedOutput = path.resolve(outputPath);
  const baseEvidence = JSON.parse(fs.readFileSync(path.resolve(baseEvidencePath), "utf8")) as EvidenceRecord[];
  const sources: EvidenceRecord[][] = [baseEvidence];

  if (additionalEvidencePath && additionalEvidencePath !== outputPath) {
    const additionalEvidence = JSON.parse(fs.readFileSync(path.resolve(additionalEvidencePath), "utf8")) as EvidenceRecord[];
    sources.push(additionalEvidence);
  }

  const normalized = aggregateEvidence(sources);
  fs.mkdirSync(path.dirname(resolvedOutput), { recursive: true });
  fs.writeFileSync(resolvedOutput, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  process.stdout.write(`Generated ${resolvedOutput}\n`);
}
