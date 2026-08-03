# AIRS CRM — Full Build Plan

## Overview

Local-first competitor weakness analysis platform built with Next.js, SQLite, Crawlee, and Playwright.

---

## Phase 1 — Foundation (DONE ✅)

| Step | Status | Description |
|------|--------|-------------|
| Install deps | ✅ | better-sqlite3, cheerio, crawlee, playwright |
| Database schema | ✅ | 10 tables in `prisma/schema.sql` |
| DB connection layer | ✅ | `src/lib/db.ts` with query helpers |
| TypeScript types | ✅ | All entities in `src/types/index.ts` |
| Evaluation CRUD API | ✅ | `/api/evaluations` + `/api/evaluations/[id]` |
| Competitor CRUD API | ✅ | `/api/evaluations/[id]/competitors` |
| Evidence CRUD API | ✅ | `/api/evaluations/[id]/evidence` |
| Search API | ✅ | DuckDuckGo scraper at `/api/search` |
| Scrape API | ✅ | Cheerio scraper at `/api/scrape` |
| Evaluation wizard | ✅ | 4-step form (Define → Competitors → Evidence → Launch) |
| Dashboard | ✅ | General + project-scoped dashboards |

---

## Phase 1.5 — Project Navigation (DONE ✅)

| Step | Status | Description |
|------|--------|-------------|
| Projects API | ✅ | CRUD at `/api/projects` + `/api/projects/[id]` |
| Two-state sidebar | ✅ | General view vs project-scoped view |
| General dashboard | ✅ | Global stats + projects list |
| Create project page | ✅ | `/projects/new` with name + description |
| Project dashboard | ✅ | `/projects/[projectId]` with scoped stats |
| Evaluations under project | ✅ | `/projects/[projectId]/evaluations/*` |
| Missions under project | ✅ | `/projects/[projectId]/missions` |
| Benchmarks under project | ✅ | `/projects/[projectId]/benchmarks` |
| Old routes redirect | ✅ | `/evaluations`, `/missions`, `/benchmarks` → `/dashboard` |

---

## Phase 2 — Scoring Engine (DONE ✅)

| Step | Status | Description |
|------|--------|-------------|
| Define scoring weights per dimension | ✅ | `src/lib/scoring.ts` — 7 dimensions with weights |
| Map evidence categories to dimensions | ✅ | `src/lib/scoring.ts` |
| Implement `calculateScores(evaluationId)` | ✅ | `src/lib/scoring.ts` |
| Calculate per-competitor scores (0–100) | ✅ | `src/lib/scoring.ts` |
| Calculate overall RRS score (weighted avg) | ✅ | `src/lib/scoring.ts` |
| Assign AIRS Rating (Platinum/Gold/Silver/Bronze/Foundation) | ✅ | `src/lib/scoring.ts` |
| API endpoint: `POST /api/evaluations/[id]/score` | ✅ | `src/app/api/evaluations/[id]/score/route.ts` |
| Store dimension scores in `dimension_scores` table | ✅ | Uses existing schema |
| Update competitor scores in `competitors` table | ✅ | Uses existing schema |

---

## Phase 3 — Findings & Recommendations (DONE ✅)

| Step | Status | Description |
|------|--------|-------------|
| Define finding templates per dimension | ✅ | `src/lib/findings.ts` — OPPORTUNITY_PATTERNS |
| Implement `generateFindings(evaluationId)` | ✅ | `src/lib/findings.ts` |
| Compare competitor vs your asset per dimension | ✅ | `src/lib/findings.ts` |
| Classify findings by severity (high/medium/low) | ✅ | `src/lib/findings.ts` |
| Generate recommendations from findings | ✅ | `src/lib/recommendations.ts` |
| Assign priority + effort + impact to recommendations | ✅ | `src/lib/recommendations.ts` |
| API: `POST/GET /api/evaluations/[id]/findings` | ✅ | `src/app/api/evaluations/[id]/findings/route.ts` |
| API: `POST/GET /api/evaluations/[id]/recommendations` | ✅ | `src/app/api/evaluations/[id]/recommendations/route.ts` |

---

## Phase 4 — Evaluation Detail UI (DONE ✅)

| Step | Status | Description |
|------|--------|-------------|
| Score summary card (overall RRS + rating badge) | ✅ | `src/components/evaluation-detail.tsx` |
| Dimension score breakdown (radar chart) | ✅ | Recharts RadarChart |
| Competitor comparison table with scores | ✅ | `src/components/evaluation-detail.tsx` |
| Findings list grouped by severity | ✅ | `src/components/evaluation-detail.tsx` |
| Recommendations list with priority/effort/impact | ✅ | `src/components/evaluation-detail.tsx` |
| "Re-score" button to trigger scoring API | ✅ | `src/components/evaluation-detail.tsx` |
| "Generate Findings" button | ✅ | `src/components/evaluation-detail.tsx` |
| Executive summary with weakest/strongest dimensions | ✅ | `src/components/evaluation-detail.tsx` |
| Print-optimized evaluation report page | ✅ | `src/app/projects/[projectId]/evaluations/[id]/report/page.tsx` |

---

## Phase 5 — Reports (DONE ✅)

| Step | Status | Description |
|------|--------|-------------|
| Report API: `POST/GET /api/evaluations/[id]/report` | ✅ | `src/app/api/evaluations/[id]/report/route.ts` |
| Evaluation report page | ✅ | `src/app/projects/[projectId]/evaluations/[id]/report/page.tsx` |
| Executive summary section | ✅ | Report page |
| Evaluation scope section | ✅ | Report page |
| Findings section (grouped by severity) | ✅ | Report page |
| Recommendations section (sorted by priority) | ✅ | Report page |
| Score breakdown section | ✅ | Report page |
| Print-friendly CSS (Ctrl+P → Save as PDF) | ✅ | Report page |
| Mission report page (print-optimized) | ✅ | `src/app/projects/[projectId]/missions/[id]/report/page.tsx` |

---

## Phase 6 — Missions (DONE ✅)

| Step | Status | Description |
|------|--------|-------------|
| Mission creation from recommendations | ✅ | `src/app/api/missions/route.ts` |
| Mission + task API routes | ✅ | `/api/missions`, `/api/missions/[id]`, `/api/missions/[id]/tasks/[taskId]` |
| Missions list page (project-scoped) | ✅ | `src/app/projects/[projectId]/missions/page.tsx` |
| Mission detail page with task management | ✅ | `src/app/projects/[projectId]/missions/[id]/page.tsx` |
| 12-month phased mission structure (4 phases) | ✅ | Phase 1-4 with strategic task templates |
| Strategic task templates (content clusters, AEO, authority) | ✅ | `src/app/api/missions/route.ts` — STRATEGIC_TASKS |
| Collapsible phase sections in UI | ✅ | `src/app/projects/[projectId]/missions/[id]/page.tsx` |
| Self-audit integration | ✅ | `/api/missions/[id]/self-audit` — audit creates Phase 1 tasks |
| Auto-verification (Check Website button) | ✅ | `/api/missions/[id]/tasks/[taskId]/verify` — scrapes & verifies |
| All tasks have indicator_code for verification | ✅ | No manual check-offs — system verifies |
| Mission report page (PDF export) | ✅ | `src/app/projects/[projectId]/missions/[id]/report/page.tsx` |

### Mission Phases

| Phase | Timeline | Description |
|-------|----------|-------------|
| Phase 1: Foundation & Quick Wins | Month 1 | Technical fixes from audit — HTTPS, meta tags, headings, speed, Schema.org |
| Phase 2: Content & On-Page Optimization | Month 2-3 | Content clusters, answer-first content, OG tags, title optimization, internal linking |
| Phase 3: Authority & Trust Building | Month 4-6 | Reviews, contact info, external links, third-party platform presence |
| Phase 4: Scale & AI Visibility | Month 7-12 | AEO for ChatGPT/Perplexity, original research, content refresh, SERP features |

---

## Phase 7 — Benchmarks (DONE ✅)

| Step | Status | Description |
|------|--------|-------------|
| Score history tracking (every scoring run recorded) | ✅ | `score_history` table + `src/lib/scoring.ts` |
| Score history line chart over time | ✅ | `src/app/projects/[projectId]/benchmarks/page.tsx` |
| Per-evaluation score trends (multi-line chart) | ✅ | Benchmarks page |
| Per-dimension score trends over time | ✅ | Benchmarks page — one line per dimension |
| Mission progress correlation (bar chart) | ✅ | Benchmarks page — completion % per mission |
| Target score setting (project-level) | ✅ | `projects.target_score` column + benchmarks API PUT |
| Target score dashed line on all charts | ✅ | Recharts ReferenceLine |
| Trend indicators (up/down/stable) on summary cards | ✅ | Benchmarks page |
| Competitive comparison (you vs competitor avg) | ✅ | Benchmarks page |
| Dimension averages (current snapshot) | ✅ | Benchmarks page |
| Industry average across all evaluations | ✅ | Benchmarks page |
| Benchmarks API: `GET/PUT /api/projects/[id]/benchmarks` | ✅ | `src/app/api/projects/[id]/benchmarks/route.ts` |

---

## Phase 8 — Crawlee + Playwright Integration (NOT STARTED)

**Goal:** Replace simple Cheerio scraper with Crawlee crawler for multi-page crawling with JS rendering fallback.

### Steps

| # | Task | Files | Priority |
|---|------|-------|----------|
| 1 | Create Crawlee crawler with HTTP-first strategy | `src/lib/crawler.ts` | High |
| 2 | Add Playwright fallback for JS-heavy pages | `src/lib/crawler.ts` | High |
| 3 | Crawl multiple pages per competitor (homepage + about + services) | `src/lib/crawler.ts` | High |
| 4 | Respect robots.txt and rate limiting | `src/lib/crawler.ts` | High |
| 5 | Extract evidence from each crawled page | `src/lib/crawler.ts` | High |
| 6 | API: `POST /api/evaluations/[id]/crawl` | `src/app/api/evaluations/[id]/crawl/route.ts` | High |
| 7 | Update wizard step 3 to use crawler instead of single-page scraper | Update wizard | Medium |
| 8 | Crawl progress indicator in UI | Update wizard | Low |

---

## Phase 9 — Polish & Settings (PARTIALLY DONE)

| Step | Status | Description |
|------|--------|-------------|
| Settings page: AIRS Standard reference | ✅ | `src/app/settings/page.tsx` |
| Knowledge Base page | ✅ | `src/app/knowledge/page.tsx` |
| Delete evaluation confirmation dialog | ✅ | `src/components/confirm-dialog.tsx` |
| Delete project confirmation dialog | ✅ | `src/components/confirm-dialog.tsx` |
| Loading states for async operations | ✅ | Loader2 spinners throughout |
| Error handling | ✅ | Error states in all pages |
| Toast notifications | ❌ | Not implemented |
| Responsive layout (mobile-friendly sidebar) | ❌ | Not implemented |
| Dark mode support | ❌ | Not implemented |
| Search/filter on evaluations table | ❌ | Not implemented |
| Export evaluations as CSV | ❌ | Not implemented |
| Lint clean (0 errors, 0 warnings) | ✅ | Fixed all 50 lint issues |

---

## Milestone Status

```
Phase 1 (Foundation) ✅
Phase 1.5 (Project Nav) ✅
Phase 2 (Scoring) ✅
Phase 3 (Findings) ✅
Phase 4 (Eval Detail UI) ✅
Phase 5 (Reports) ✅
Phase 6 (Missions + Auto-verification) ✅
Phase 7 (Benchmarks + Score History) ✅
Phase 8 (Crawler) ← NEXT
Phase 9 (Polish) ← partially done, finish after Phase 8
```

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Frontend | Next.js 16, React, TailwindCSS |
| Icons | Lucide |
| Charts | Recharts |
| Database | SQLite (better-sqlite3) |
| Search | DuckDuckGo HTML scraping (Cheerio) |
| Scraping | Cheerio (current) → Crawlee + Playwright (Phase 8) |
| Types | TypeScript |
| Future | Prisma + PostgreSQL + Vercel deployment |
