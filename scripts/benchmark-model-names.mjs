/** Einheitliche Modellnamen ohne „(EUrouter)“ in der UI. */
export function canonicalModelName(name) {
  return String(name ?? "")
    .replace(/\s*\(EUrouter\)\s*$/i, "")
    .trim();
}

export function migratePositionKeys(positions) {
  const out = {};
  for (const [qid, row] of Object.entries(positions ?? {})) {
    out[qid] = {};
    for (const [model, stance] of Object.entries(row)) {
      out[qid][canonicalModelName(model)] = stance;
    }
  }
  return out;
}
