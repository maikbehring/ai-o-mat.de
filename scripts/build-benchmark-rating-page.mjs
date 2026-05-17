#!/usr/bin/env node
/**
 * Erzeugt die Vergleichsseite unter public/benchmark-vergleich/ (für GitHub Pages / ai-o-mat.de).
 * Nutzung: node scripts/build-benchmark-rating-page.mjs [benchmark.md]
 *          node scripts/build-benchmark-rating-page.mjs --reclassify
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadOrBuildPositions,
  loadCachedPositions,
  patchQuestionPositions,
} from "./classify-benchmark-positions.mjs";
import { BENCHMARKS } from "./cultural-bias-benchmark.mjs";
import { canonicalModelName, migratePositionKeys } from "./benchmark-model-names.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT_DIR = join(ROOT, "public", "benchmark-vergleich");
const OUT_HTML = join(OUT_DIR, "index.html");

const MITTWALD_ORDER = ["Qwen3.5", "Ministral", "gpt-oss-120b"];

/** Vollständige Modellliste für Startseite (auch wenn MD noch nicht alle enthält). */
const ROSTER_ORDER = [
  ...MITTWALD_ORDER,
  "Gemma 4",
  "GLM-5",
  "DeepSeek Chat V3.1",
  "Nova 2 Lite",
  "Claude Haiku 4.5",
  "Llama 4 Maverick",
  "GPT-5.4",
  "Mistral Large 3",
];

const MODEL_COLORS = {
  "Qwen3.5": "#c1121f",
  Ministral: "#1d4e89",
  "gpt-oss-120b": "#0d9488",
  "Gemma 4": "#7c3aed",
  "GLM-5": "#ea580c",
  "DeepSeek Chat V3.1": "#b45309",
  "Nova 2 Lite": "#0891b2",
  "Claude Haiku 4.5": "#be185d",
  "Llama 4 Maverick": "#4f46e5",
  "GPT-5.4": "#0f766e",
  "Mistral Large 3": "#5b21b6",
};

/** Hersteller, Ursprungsland/Region, API-Zugang */
const MODEL_META = {
  "Qwen3.5": {
    vendor: "Alibaba (Qwen)",
    origin: "China",
    access: "Mittwald KI-Hosting (Deutschland)",
  },
  Ministral: {
    vendor: "Mistral AI",
    origin: "Frankreich",
    access: "Mittwald KI-Hosting (Deutschland)",
  },
  "gpt-oss-120b": {
    vendor: "OpenAI",
    origin: "USA",
    access: "Mittwald KI-Hosting (Deutschland)",
  },
  "Gemma 4": {
    vendor: "Google (Gemma)",
    origin: "USA",
    access: "",
  },
  "GLM-5": {
    vendor: "Zhipu AI (GLM)",
    origin: "China",
    access: "",
  },
  "DeepSeek Chat V3.1": {
    vendor: "DeepSeek",
    origin: "China",
    access: "",
  },
  "Nova 2 Lite": {
    vendor: "Amazon (Nova)",
    origin: "USA",
    access: "",
  },
  "Claude Haiku 4.5": {
    vendor: "Anthropic (Claude)",
    origin: "USA",
    access: "",
  },
  "Llama 4 Maverick": {
    vendor: "Meta (Llama 4)",
    origin: "USA",
    access: "",
  },
  "GPT-5.4": {
    vendor: "OpenAI",
    origin: "USA",
    access: "",
  },
  "Mistral Large 3": {
    vendor: "Mistral AI",
    origin: "Frankreich",
    access: "",
  },
};

function metaForModel(name) {
  const key = canonicalModelName(name);
  return (
    MODEL_META[key] ?? {
      vendor: "—",
      origin: "—",
      access: "",
    }
  );
}

/** Anzeige in Ergebnisliste: Kurzname · Hersteller, Land. */
function displayNameForModel(name, meta = metaForModel(name)) {
  const base = canonicalModelName(name);
  return `${base} · ${meta.vendor}, ${meta.origin}`;
}

function metaWithDisplay(name) {
  const meta = metaForModel(name);
  return { ...meta, displayName: displayNameForModel(name, meta) };
}

const PALETTE = ["#c1121f", "#1d4e89", "#0d9488", "#7c3aed", "#ea580c", "#0891b2", "#be185d", "#65a30d"];

function colorForModel(name, index) {
  return MODEL_COLORS[name] ?? PALETTE[index % PALETTE.length];
}

function sortModels(names) {
  const set = new Set(names);
  const ordered = MITTWALD_ORDER.filter((m) => set.has(m));
  const rest = [...set].filter((m) => !MITTWALD_ORDER.includes(m)).sort();
  return [...ordered, ...rest];
}

function resolveMarkdownPath(arg) {
  if (arg && !arg.startsWith("--")) return join(ROOT, arg);
  const docs = join(ROOT, "docs");
  const files = readdirSync(docs)
    .filter((f) => f.startsWith("kultur-bias-benchmark-") && f.endsWith(".md"))
    .sort()
    .reverse();
  if (!files[0]) throw new Error("Keine docs/kultur-bias-benchmark-*.md gefunden.");
  return join(docs, files[0]);
}

function parseBenchmark(md, sourceFile) {
  const meta = {};
  const mGen = md.match(/\*\*Erzeugt:\*\* (.+)/);
  if (mGen) meta.generatedAt = mGen[1].trim();

  const modelNames = new Set();
  const questions = [];
  const blocks = md.split(/^## (\d+)\. /m).slice(1);

  for (let i = 0; i < blocks.length; i += 2) {
    const id = Number(blocks[i]);
    const body = blocks[i + 1];
    if (!body || body.startsWith("System-Prompt") || body.startsWith("Kurzvergleich")) continue;

    const titleLine = body.split("\n")[0].trim();
    const qMatch = body.match(/^> (.+)$/m);
    const prompt = qMatch?.[1]?.trim() ?? "";

    const rows = [];
    for (const line of body.split("\n")) {
      if (!line.startsWith("| ") || line.includes("Modell | Antwort")) continue;
      if (line.startsWith("|--------")) continue;
      const parts = line.split("|").map((p) => p.trim()).filter(Boolean);
      if (parts.length < 3) continue;
      const [modelRaw, answer, wordsRaw] = parts;
      if (modelRaw === "Modell") continue;
      const model = canonicalModelName(modelRaw);
      const words = Number.parseInt(wordsRaw, 10) || 0;
      const overLimit = /⚠️/.test(wordsRaw);
      rows.push({ model, answer, words, overLimit });
      modelNames.add(model);
    }

    if (rows.length >= 4) {
      questions.push({ id, title: titleLine, prompt, models: rows });
    }
  }

  const models = sortModels([...modelNames]);
  for (const q of questions) {
    q.models.sort((a, b) => models.indexOf(a.model) - models.indexOf(b.model));
  }

  const modelColors = Object.fromEntries(models.map((m, i) => [m, colorForModel(m, i)]));
  const modelMeta = Object.fromEntries(models.map((m) => [m, metaWithDisplay(m)]));

  return { sourceFile, meta, models, modelColors, modelMeta, questions };
}

/** Startseite + Wizard-Thesen: Katalog und aktuelle Prompts aus BENCHMARKS. */
function enrichForIntro(data) {
  const byId = Object.fromEntries(BENCHMARKS.map((b) => [b.id, b]));
  const existingIds = new Set(data.questions.map((q) => q.id));
  for (const b of BENCHMARKS) {
    if (existingIds.has(b.id)) {
      const q = data.questions.find((x) => x.id === b.id);
      q.title = b.title;
      q.prompt = b.prompt;
    } else {
      data.questions.push({
        id: b.id,
        title: b.title,
        prompt: b.prompt,
        models: [],
      });
    }
  }
  data.questions.sort((a, b) => a.id - b.id);

  data.models = ROSTER_ORDER;
  data.modelMeta = Object.fromEntries(ROSTER_ORDER.map((m) => [m, metaWithDisplay(m)]));
  data.modelColors = Object.fromEntries(
    ROSTER_ORDER.map((m, i) => [m, colorForModel(m, i)]),
  );

  for (const q of data.questions) {
    for (const m of q.models) m.model = canonicalModelName(m.model);
    const order = new Map(ROSTER_ORDER.map((m, i) => [m, i]));
    q.models.sort((a, b) => (order.get(a.model) ?? 99) - (order.get(b.model) ?? 99));
  }
}

function applyPositions(data, positions) {
  const migrated = migratePositionKeys(positions);
  for (const q of data.questions) {
    const qp = migrated[String(q.id)] ?? {};
    for (const m of q.models) {
      m.model = canonicalModelName(m.model);
      m.position = qp[m.model] ?? "neutral";
    }
  }
}

function buildHtml(data) {
  const tplPath = join(__dirname, "templates", "benchmark-wahlomat.html");
  const tpl = readFileSync(tplPath, "utf8");
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  if (!tpl.includes("__DATA_JSON__")) {
    throw new Error("Template-Platzhalter __DATA_JSON__ fehlt in " + tplPath);
  }
  return tpl.replace("__DATA_JSON__", json);
}

async function main() {
  const force = process.argv.includes("--reclassify");
  const onlyQ = process.argv
    .find((a) => a.startsWith("--only-questions="))
    ?.slice("--only-questions=".length)
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => n > 0);
  const mdPath = resolveMarkdownPath(process.argv.find((a) => a.endsWith(".md")));
  const md = readFileSync(mdPath, "utf8");
  const data = parseBenchmark(md, mdPath.replace(ROOT + "/", ""));
  if (data.questions.length === 0) {
    throw new Error("Keine Fragen in " + mdPath + " geparst.");
  }
  enrichForIntro(data);

  const useCacheOnly = process.argv.includes("--use-cache");
  const positions = useCacheOnly
    ? loadCachedPositions() ??
      (() => {
        throw new Error("Kein Cache unter public/benchmark-vergleich/positions.json");
      })()
    : onlyQ?.length
      ? await patchQuestionPositions(data, onlyQ)
      : await loadOrBuildPositions(data, { force });
  applyPositions(data, positions);

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT_HTML, buildHtml(data), "utf8");
  for (const name of ["impressum.html", "datenschutz.html", "legal.css"]) {
    copyFileSync(join(ROOT, "public", name), join(OUT_DIR, name));
  }
  console.log(`Geschrieben: ${OUT_HTML}`);
  console.log(`Fragen: ${data.questions.length} · Modelle: ${data.models.join(", ")}`);
  console.log(`Öffnen: open public/benchmark-vergleich/index.html`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
