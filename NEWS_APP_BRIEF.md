# Product & Architecture Brief: Next-Gen Contextual News App

- **Origin Conversation**: `conversation://dc526d49-acdc-4849-a4ed-1f3a3e5d42b2`
- **Source Data Repository**: `c:\Users\caiol\Documents\Dev\Vibe-O-Meter of News Sources`
- **Live Static JSON Base URL**: `https://caiolaborda.github.io/vibe-o-meter/data/`
- **Feed Exporter Script**: `scripts/export-feeds.js`
- **Sync & AI Clustering Pipeline**: `scripts/sync.js`

---

## 1. Vision & Product Premise

Whereas **No Good News / Some Good News** focuses on auditing media negativity vs. constructive breakthroughs, this standalone product is a **high-signal, unbiased, deeply contextualized news intelligence app**.

**The Solution**: An editorial experience combining **Axios "Smart Brevity" + The Economist's global synthesis + Wikipedia's encyclopedic grounding + a Longitudinal Story Arc engine**—all running autonomously with **zero extra LLM API calls** by consuming the enriched static JSON feeds published every sync cycle.

---

## 2. Core UX: Progressive Depth (The 4-Layer Story Dossier)

### Depth 0 — The 10-Second Surface Scan
- **Calm, Neutral Wire Headline** (`cluster.story`) stripped of clickbait.
- **Convergence Badge**: e.g., `14 Outlets · 5 Regions` (`cluster.outletCount`, `cluster.regionsCovered`).
- **Smart Brevity Triad** (`cluster.briefing`):
  - **What happened**: 1 crisp sentence stating the verified real-world event.
  - **Why it matters**: 1 sentence on structural, geopolitical, economic, or scientific stakes.
  - **What's next**: 1 sentence on upcoming milestones, votes, or narrative divergence.
- **Multi-Angle Press Photo Strip** (`cluster.images`): Horizontal carousel of distinct editorial photos pulled from all covering newsrooms (`url`, `sourceName`, `caption`).

### Depth 1 — Longitudinal Story Arcs ("How This Story Evolved")
- Powered by `cluster.chapters` + `firstSeenAt` / `latestUpdateAt`.
- Visualizes a developing story as a **Chain of Chapters** over time (*Initial Dispatch* → *Broadening Coverage* → *Previous Sync Snapshots* → *Latest Consensus*).

### Depth 2 — Instant Encyclopedic Context (Zero-Cost Wikipedia Grounding)
- Powered by `cluster.wikiEntities` (`["Strait of Hormuz", "European Central Bank", ...]`).
- On click/hover, fetch Wikipedia's free, CORS-enabled REST endpoint on demand:
  - `GET https://en.wikipedia.org/api/rest_v1/page/summary/{encodeURIComponent(entity)}`
- Returns verified 2–3 sentence summary (`extract`), high-res thumbnail/map (`thumbnail.source`), and `coordinates` (`lat`, `lon`).

### Depth 3 — Regional Lenses, Blindspots & Spin Separation
- **Regional Perspectives (`cluster.regionBreakdown`)**: Compare how `NA`, `UK`, `EU`, `ME`, `APAC`, and `LATAM` cover the exact same event.
- **Regional Blindspot Radar (`cluster.blindspotRegions`)**: Highlights major global stories (4+ outlets) with zero coverage in a given region.
- **Fact vs. Spin Separation (`eventBase` vs. `framingMod`)**: Every article in `cluster.coverage` includes its 4-factor breakdown (`factors: [polarity, reach, permanence, framing]`), enabling a **"Spin Slider"** from most alarmist headline (`sentimentSpread.min`) to most composed headline (`sentimentSpread.max`).

---

## 3. Live Static JSON Endpoints

- **API Directory**: `https://caiolaborda.github.io/vibe-o-meter/data/index.json`
- **Enriched Story Clusters**: `https://caiolaborda.github.io/vibe-o-meter/data/clusters.json`
- **Constructive / Good News**: `https://caiolaborda.github.io/vibe-o-meter/data/good-news.json`
- **40-Outlet Metadata & Baselines**: `https://caiolaborda.github.io/vibe-o-meter/data/outlets.json`
- **Historical Time Series**: `https://caiolaborda.github.io/vibe-o-meter/data/timeseries.json`
