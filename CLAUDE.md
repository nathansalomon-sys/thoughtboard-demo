# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Thoughtboard** is a feedback intelligence tool for PMs. It aggregates customer feedback from scattered sources, uses AI to transform qualitative noise into quantifiable insights, and lets PMs query feedback conversationally — from high-level sentiment trends down to individual quotes.

## Stack

- **Workers** — runtime, API routes, serves static frontend assets
- **D1** — structured feedback storage (raw + AI-processed fields)
- **Workers AI** — sentiment analysis, theme classification, conversational query synthesis
- **Workflows** — orchestrates the ingestion-to-analysis pipeline

## Data

`mock_data_raw.json` — 600 raw feedback entries across 3 products (Workers AI, D1, Workflows) and 5 sources:

| Source | Source-specific fields |
|---|---|
| `support_ticket` | `priority`, `status` |
| `github` | `issue_title`, `issue_labels` |
| `discord` | `channel_name` |
| `reddit` | `subreddit`, `upvotes` |
| `twitter` | `likes`, `retweets` |

Common fields: `id`, `timestamp`, `source`, `user_handle`, `content`.

Raw entries have no AI-processed fields. The Workflows pipeline adds: `product`, `theme`, `sentiment`, `sentiment_score` (-1.0 to 1.0), `urgency` (1–4), `urgency_label`.

Product skews in the data: Workers AI (positive), D1 (negative), Workflows (mixed).

## Dashboard Layout

- **Top bar**: Product selector + Time range selector
- **Row 0**: Summary stats (total feedback, % change, active themes)
- **Row 1**: Sentiment meter (speedometer) + Sentiment trend over time
- **Row 2**: Feedback volume over time + Top themes ranked — both with multi-select source filter; themes are clickable
- **Row 3**: Quote-board — populates on theme click, supports source and sentiment filters
- **Bottom**: Deep Dive conversational query (powered by Workers AI)

## Key Design Decisions

- Feedback is pre-classified at ingestion (Workflows pipeline), not via real-time semantic search.
- Source type (community vs. direct) is a **filter**, not a layout split.
- All charts and the quote-board support multi-select source filtering.

## Development Stages

Complete in order. Announce when starting each stage; summarize and commit when done.

1. **Scaffold** — `npm create cloudflare@latest`, configure `wrangler.jsonc` with D1 + Workers AI + Workflows bindings
2. **Database** — Create D1 schema (raw + processed tables), seed with `mock_data_raw.json`
3. **Pipeline** — Build Workflows pipeline: ingest raw → Workers AI sentiment + theme classification → store processed results in D1
4. **API** — Build Worker API routes for dashboard (products list, sentiment data, themes, quotes, deep dive query)
5. **Frontend** — Build dashboard UI per the Dashboard Layout spec
6. **Deploy** — Deploy to Cloudflare Workers, verify live

## Logging

- `FRICTION_LOG.md` — maintained by Nathan (human DX experience). **Do not edit.**
- `DEV_FRICTION_LOG.md` — technical friction log maintained by Claude Code. Log **every** Cloudflare platform issue immediately when it occurs:

```
### [Timestamp] Title
- **What happened:** Description of the issue
- **Impact:** Quantified effect (e.g., "15 minutes lost", "workaround required X extra lines", "fix found on Reddit, not in docs")
- **Resolution:** How it was resolved
- **Source:** Official docs / Stack Overflow / Reddit / trial and error / etc.
```
