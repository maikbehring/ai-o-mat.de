#!/usr/bin/env node
/** Kopiert App + Rechtstexte ins Repo-Root für GitHub Pages. */
import { copyFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const built = join(root, "public", "benchmark-vergleich", "index.html");
const destRoot = root;

if (!existsSync(built)) {
  console.error("Fehlt:", built, "— zuerst npm run benchmark:rating-page:cache");
  process.exit(1);
}

copyFileSync(built, join(destRoot, "index.html"));
console.log("Geschrieben:", join(destRoot, "index.html"));

for (const name of ["impressum.html", "datenschutz.html", "legal.css"]) {
  const src = join(root, "public", name);
  if (!existsSync(src)) {
    console.error("Fehlt:", src);
    process.exit(1);
  }
  copyFileSync(src, join(destRoot, name));
  console.log("Geschrieben:", join(destRoot, name));
}
