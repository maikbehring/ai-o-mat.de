#!/usr/bin/env node
/** Kopiert die gebaute App nach index.html (Repo-Root) für GitHub Pages. */
import { copyFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "public", "benchmark-vergleich", "index.html");
const dest = join(root, "index.html");

if (!existsSync(src)) {
  console.error("Fehlt:", src, "— zuerst npm run benchmark:rating-page:cache");
  process.exit(1);
}
copyFileSync(src, dest);
console.log("Geschrieben:", dest);
