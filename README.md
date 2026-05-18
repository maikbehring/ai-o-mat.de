# ai-o-mat.de

Wahl-O-Mat-ähnlicher Vergleich: Du beantwortest **48 politisch-gesellschaftliche Thesen** mit *stimme zu*, *neutral* oder *stimme nicht zu*. Die App zeigt, wie stark deine Antworten mit **13 KI-Modellen** (inkl. Grok 4.3 über xAI) übereinstimmen, die dieselben Thesen zuvor in einem standardisierten Benchmark beantwortet haben.

**Live-Demo (GitHub Pages):** nach Aktivierung unter [maikbehring.github.io/ai-o-mat.de](https://maikbehring.github.io/ai-o-mat.de/)

## Transparenz

| Artefakt | Inhalt |
|----------|--------|
| [`docs/kultur-bias-benchmark-2026-05-16.md`](docs/kultur-bias-benchmark-2026-05-16.md) | Vollständige Rohantworten aller Modelle (Markdown) |
| [`public/benchmark-vergleich/positions.json`](public/benchmark-vergleich/positions.json) | Klassifizierte Positionen (zustimmung / neutral / ablehnung) |
| [`scripts/cultural-bias-benchmark.mjs`](scripts/cultural-bias-benchmark.mjs) | Thesen, System-Prompt, Modellliste, API-Aufrufe |
| [`scripts/classify-benchmark-positions.mjs`](scripts/classify-benchmark-positions.mjs) | Zuordnung der Freitext-Antworten zu Ja/Nein/Neutral |
| [`scripts/build-benchmark-rating-page.mjs`](scripts/build-benchmark-rating-page.mjs) | Erzeugt die statische Web-App |
| [`scripts/templates/benchmark-wahlomat.html`](scripts/templates/benchmark-wahlomat.html) | UI-Vorlage |

**Nicht im Repo:** API-Keys (`.env`), interne Logs, personenbezogene Privatnotizen.

## Modelle (Stand Mai 2026)

| Modell | Zugang |
|--------|--------|
| Qwen3.5, Qwen3.6, Ministral, gpt-oss-120b | Mittwald AI Hosting |
| Gemma 4, GLM-5, DeepSeek Chat V3.1, Nova 2 Lite, Claude Haiku 4.5, Llama 4 Maverick, GPT-5.4, Mistral Large 3 | EUrouter (OpenAI-kompatible API) |

Die Anzeige nutzt kanonische Namen ohne „(EUrouter)“-Suffix; nur Mittwald-Modelle sind mit „Mittwald“ als Zugang gekennzeichnet.

## Benchmark nachvollziehen

1. Repository klonen, `.env` aus `.env.example` anlegen.
2. Keys: `MITTWALD_AI_API_KEY` (Mittwald-Modelle), `EUROUTER_API_KEY` (übrige Modelle + optional Klassifizierungs-Judge).
3. Vollständiger Lauf und Seitenbau:

```bash
npm run benchmark:full
```

4. Nur Seite aus vorhandenem Markdown + Cache:

```bash
npm run benchmark:rating-page:cache
```

5. Lokale Vorschau: `open public/benchmark-vergleich/index.html` (oder `index.html` im Repo-Root für GitHub Pages).

### Einzelne Thesen neu laufen

```bash
npm run benchmark:question-42   # Beispiel: These 42
```

## Methodik (Kurz)

- **Prompt:** Modelle sollen mit *Ja* oder *Nein* antworten; *Neutral* nur in seltenen Fällen. Temperatur 0,25.
- **Klassifizierung:** Freitext-Antworten werden per LLM-Judge (Standard: `nova-2-lite`) in `zustimmung` / `neutral` / `ablehnung` eingeordnet; Ergebnis in `positions.json` gecacht.
- **Vergleich:** Nutzer-*neutral* zählt als Übereinstimmung mit Modell-*neutral*.

Ausführliche Rohdaten und Diskussion: siehe `docs/kultur-bias-benchmark-2026-05-16.md`.

## Lizenz

Quellcode und Benchmark-Daten zur Nachvollziehbarkeit veröffentlicht. Marken Dritter (Modellnamen, Anbieter) gehören den jeweiligen Rechteinhabern.
