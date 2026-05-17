#!/usr/bin/env node
/** Schreibt aktuelle BENCHMARKS-Thesen in docs/kultur-bias-benchmark-*.md */

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BENCHMARKS } from "./cultural-bias-benchmark.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const docs = join(ROOT, "docs");
const file = readdirSync(docs)
  .filter((f) => f.startsWith("kultur-bias-benchmark-") && f.endsWith(".md"))
  .sort()
  .reverse()[0];
const path = join(docs, file);
let md = readFileSync(path, "utf8");

for (const b of BENCHMARKS) {
  const re = new RegExp(
    `(## ${b.id}\\. [^\\n]+\\n\\n\\*\\*Frage:\\*\\*\\n\\n> )[^\\n]+`,
  );
  if (!re.test(md)) {
    console.warn(`These ${b.id} nicht gefunden in ${file}`);
    continue;
  }
  md = md.replace(re, `$1${b.prompt}`);
}

writeFileSync(path, md, "utf8");
console.log(`Thesen synchronisiert: ${path}`);
