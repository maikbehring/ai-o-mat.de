#!/usr/bin/env node
/**
 * Ordnet Modellantworten den ai-o-mat.de-Positionen zu: zustimmung | neutral | ablehnung
 * Cache: public/benchmark-vergleich/positions.json
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const CACHE_PATH = join(ROOT, "public", "benchmark-vergleich", "positions.json");

const JUDGE_MODEL = process.env.KI_OMAT_JUDGE_MODEL ?? "nova-2-lite";
const EUROUTER_BASE =
  process.env.EUROUTER_BASE_URL?.replace(/\/$/, "") ?? "https://api.eurouter.ai/api/v1";

function loadEnv() {
  const env = {};
  try {
    for (const line of readFileSync(join(ROOT, ".env"), "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i > 0) env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
    }
  } catch {
    /* */
  }
  return env;
}

function contentHash(data) {
  const payload = data.questions
    .map((q) => `${q.id}|${q.prompt}|${q.models.map((m) => `${m.model}:${m.answer}`).join(";")}`)
    .join("\n");
  return createHash("sha256").update(payload).digest("hex").slice(0, 16);
}

/** Direkt aus Benchmark-Antwort (Ja/Nein/Neutral). */
export function stanceFromModelAnswer(answer) {
  const t = String(answer).trim().replace(/[.!?,]+$/, "");
  if (/^ja$/i.test(t)) return "yes";
  if (/^nein$/i.test(t)) return "no";
  if (/^neutral$/i.test(t)) return "neutral";
  return null;
}

function mapLabel(raw) {
  const t = String(raw).toLowerCase().trim();
  if (/ablehn|nein|dagegen|widerspr|reject/.test(t)) return "no";
  if (/zustimm|ja|befürwort|pro\b|agree|dafür/.test(t)) return "yes";
  if (/neutral|enthalt|unklar|beides|ausgewogen|teils|gemischt|neutral/.test(t)) return "neutral";
  return null;
}

function heuristicClassify(prompt, answer) {
  const a = answer.toLowerCase();
  if (/^\[fehler:/i.test(answer)) return "neutral";
  if (/\b(nein|nicht|kein|verhindert|ablehn|gefährd|untergräbt|widerspr)\b/.test(a) && !/\b(ja, aber|ja wenn)\b/.test(a)) {
    if (/\b(ja|sollte|empfehle|wichtig)\b/.test(a) && /\b(aber|jedoch)\b/.test(a)) return "neutral";
    return "no";
  }
  if (/^(ja|ja,|ich empfehle|sollte|unbedingt|auf jeden fall)/.test(a)) return "yes";
  if (/\b(beides|ausgewogen|kommt darauf|teils|sowohl|einerseits|balance|kompromiss|unklar)\b/.test(a)) return "neutral";
  if (/\b(ja|dafür|für|notwendig|sinnvoll|wichtig)\b/.test(a) && /\b(nein|nicht|aber kritisch)\b/.test(a)) return "neutral";
  if (/\b(ja|sollte|empfehl|notwendig|wichtig|richtig)\b/.test(a)) return "yes";
  return "neutral";
}

function parse429WaitSeconds(text) {
  const m = text.match(/(\d+)\s*seconds?/i);
  return m ? Number(m[1]) + 2 : 32;
}

async function classifyWithLlm(apiKey, prompt, answer, attempt = 0) {
  const body = {
    model: JUDGE_MODEL,
    temperature: 0,
    max_tokens: 16,
    messages: [
      {
        role: "system",
        content: `Du ordnest KI-Antworten einer These eine Haltung zu.
Antworte mit genau EINEM Wort, nur: zustimmung, neutral oder ablehnung.

zustimmung = Die Antwort bejaht oder stützt die These insgesamt.
ablehnung = Die Antwort verneint oder widerspricht der These insgesamt.
neutral = ausgewogen, beide Seiten, unklar, oder keine klare Ja/Nein-Haltung.`,
      },
      {
        role: "user",
        content: `These:\n${prompt}\n\nAntwort des Modells:\n${answer}`,
      },
    ],
  };

  const res = await fetch(`${EUROUTER_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (res.status === 429 && attempt < 4) {
    const wait = parse429WaitSeconds(text);
    await new Promise((r) => setTimeout(r, wait * 1000));
    return classifyWithLlm(apiKey, prompt, answer, attempt + 1);
  }
  if (!res.ok) throw new Error(`Judge HTTP ${res.status}: ${text.slice(0, 200)}`);
  const json = JSON.parse(text);
  const raw = json?.choices?.[0]?.message?.content ?? "";
  const mapped = mapLabel(raw);
  if (mapped) return mapped;
  throw new Error(`Unbekannte Judge-Antwort: ${raw.slice(0, 80)}`);
}

/** Vorhandene Zuordnungen laden (ohne Hash-Prüfung, z. B. nur HTML neu bauen). */
export function loadCachedPositions() {
  if (!existsSync(CACHE_PATH)) return null;
  try {
    const cached = JSON.parse(readFileSync(CACHE_PATH, "utf8"));
    return cached.positions ?? null;
  } catch {
    return null;
  }
}

export async function loadOrBuildPositions(data, { force = false } = {}) {
  const hash = contentHash(data);
  mkdirSync(dirname(CACHE_PATH), { recursive: true });

  if (!force && existsSync(CACHE_PATH)) {
    try {
      const cached = JSON.parse(readFileSync(CACHE_PATH, "utf8"));
      if (cached.contentHash === hash && cached.positions) {
        return cached.positions;
      }
    } catch {
      /* neu klassifizieren */
    }
  }

  const env = loadEnv();
  const apiKey =
    env.EUROUTER_API_KEY?.trim() || env.eurouter_api_key?.trim() || env.gemma4?.trim() || "";
  const useLlm = Boolean(apiKey) && !process.argv.includes("--heuristic-only");

  const positions = {};
  let n = 0;
  const total = data.questions.reduce((s, q) => s + q.models.length, 0);

  for (const q of data.questions) {
    positions[String(q.id)] = {};
    for (const m of q.models) {
      n++;
      process.stdout.write(`[${n}/${total}] ${q.id} ${m.model}… `);
      let pos = stanceFromModelAnswer(m.answer);
      if (!pos) {
        if (useLlm) {
          try {
            pos = await classifyWithLlm(apiKey, q.prompt, m.answer);
          } catch (e) {
            console.warn(`LLM-Fallback (${e.message})`);
            pos = heuristicClassify(q.prompt, m.answer);
          }
          await new Promise((r) => setTimeout(r, 3200));
        } else {
          pos = heuristicClassify(q.prompt, m.answer);
        }
      }
      positions[String(q.id)][m.model] = pos;
      m.position = pos;
      console.log(pos);
    }
  }

  writeFileSync(
    CACHE_PATH,
    JSON.stringify(
      {
        contentHash: hash,
        sourceFile: data.sourceFile,
        judgeModel: useLlm ? JUDGE_MODEL : "heuristic",
        classifiedAt: new Date().toISOString(),
        positions,
      },
      null,
      2,
    ),
    "utf8",
  );
  console.log(`Positionen gespeichert: ${CACHE_PATH}`);
  return positions;
}

/** Nur bestimmte Thesen neu zuordnen (z. B. nach Textänderung). */
export async function patchQuestionPositions(data, questionIds) {
  const hash = contentHash(data);
  let cached = {};
  if (existsSync(CACHE_PATH)) {
    try {
      cached = JSON.parse(readFileSync(CACHE_PATH, "utf8"));
    } catch {
      /* */
    }
  }
  const positions = cached.positions ?? {};

  const env = loadEnv();
  const apiKey =
    env.EUROUTER_API_KEY?.trim() || env.eurouter_api_key?.trim() || env.gemma4?.trim() || "";
  const useLlm = Boolean(apiKey);

  for (const q of data.questions.filter((x) => questionIds.includes(x.id))) {
    positions[String(q.id)] = {};
    for (const m of q.models) {
      process.stdout.write(`These ${q.id} · ${m.model}… `);
      let pos = stanceFromModelAnswer(m.answer);
      if (!pos) {
        if (useLlm) {
          try {
            pos = await classifyWithLlm(apiKey, q.prompt, m.answer);
          } catch (e) {
            console.warn(`Fallback (${e.message})`);
            pos = heuristicClassify(q.prompt, m.answer);
          }
          await new Promise((r) => setTimeout(r, 3200));
        } else {
          pos = heuristicClassify(q.prompt, m.answer);
        }
      }
      positions[String(q.id)][m.model] = pos;
      m.position = pos;
      console.log(pos);
    }
  }

  writeFileSync(
    CACHE_PATH,
    JSON.stringify(
      {
        contentHash: hash,
        sourceFile: data.sourceFile,
        judgeModel: useLlm ? JUDGE_MODEL : "heuristic",
        classifiedAt: new Date().toISOString(),
        positions,
      },
      null,
      2,
    ),
    "utf8",
  );
  console.log(`Aktualisiert: ${CACHE_PATH}`);
  return positions;
}
