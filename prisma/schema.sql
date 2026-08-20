-- AIRS CRM Database Schema (SQLite)

CREATE TABLE IF NOT EXISTS projects (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  description     TEXT,
  target_location TEXT,
  created_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS evaluations (
  id                TEXT PRIMARY KEY,
  project_id        TEXT REFERENCES projects(id) ON DELETE CASCADE,
  primary_query     TEXT NOT NULL,
  search_intent     TEXT NOT NULL,
  digital_asset_url TEXT NOT NULL,
  target_audience   TEXT,
  target_location   TEXT,          -- market this evaluation targets; drives search region
  scope             TEXT,
  status            TEXT DEFAULT 'draft',
  rrs_score         REAL,
  confidence_score  REAL,
  rating            TEXT,
  created_at        TEXT DEFAULT (datetime('now')),
  updated_at        TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS competitors (
  id              TEXT PRIMARY KEY,
  evaluation_id   TEXT REFERENCES evaluations(id) ON DELETE CASCADE,
  url             TEXT NOT NULL,
  competitor_name TEXT,
  title           TEXT,
  description     TEXT,
  competitor_type TEXT,
  score           REAL,
  created_at      TEXT DEFAULT (datetime('now'))
,
  -- How this competitor entered the field. The distinction is the product: a site the
  -- assistant *retrieved* is competing for the AI answer, while a site that merely ranks in
  -- search may not be in the answer at all. Conflating them makes "16 sources analysed" mean
  -- two different things in one sentence.
  discovered_via  TEXT            -- 'ai_retrieval' | 'serp' | 'manual' | 'self'
);

CREATE TABLE IF NOT EXISTS evidence (
  id               TEXT PRIMARY KEY,
  evaluation_id    TEXT REFERENCES evaluations(id) ON DELETE CASCADE,
  competitor_id    TEXT REFERENCES competitors(id) ON DELETE CASCADE,
  category         TEXT NOT NULL,
  indicator_code   TEXT,
  observation      TEXT NOT NULL,
  source_url       TEXT,
  evidence_type    TEXT,
  confidence_level TEXT,
  value            TEXT,
  collected_at     TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS dimension_scores (
  id              TEXT PRIMARY KEY,
  evaluation_id   TEXT REFERENCES evaluations(id) ON DELETE CASCADE,
  competitor_id   TEXT REFERENCES competitors(id) ON DELETE CASCADE,
  dimension_code  TEXT NOT NULL,
  score           REAL NOT NULL,
  max_score       REAL DEFAULT 100
);

CREATE TABLE IF NOT EXISTS findings (
  id              TEXT PRIMARY KEY,
  evaluation_id   TEXT REFERENCES evaluations(id) ON DELETE CASCADE,
  competitor_id   TEXT REFERENCES competitors(id) ON DELETE CASCADE,
  type            TEXT NOT NULL,
  dimension_code  TEXT,
  factor_code     TEXT,
  description     TEXT NOT NULL,
  impact_level    TEXT,
  evidence_ids    TEXT
);

CREATE TABLE IF NOT EXISTS recommendations (
  id              TEXT PRIMARY KEY,
  evaluation_id   TEXT REFERENCES evaluations(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  description     TEXT,
  priority        TEXT,
  effort          TEXT,
  expected_impact TEXT,
  finding_ids     TEXT,
  created_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS missions (
  id            TEXT PRIMARY KEY,
  evaluation_id TEXT REFERENCES evaluations(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  status        TEXT DEFAULT 'active',
  audit_data    TEXT,
  created_at    TEXT DEFAULT (datetime('now')),
  completed_at  TEXT
);

CREATE TABLE IF NOT EXISTS mission_tasks (
  id                TEXT PRIMARY KEY,
  mission_id        TEXT REFERENCES missions(id) ON DELETE CASCADE,
  recommendation_id TEXT REFERENCES recommendations(id),
  title             TEXT NOT NULL,
  description       TEXT,
  phase             TEXT,
  indicator_code    TEXT,
  status            TEXT DEFAULT 'todo',
  completed_at      TEXT
);

CREATE TABLE IF NOT EXISTS reports (
  id            TEXT PRIMARY KEY,
  evaluation_id TEXT REFERENCES evaluations(id) ON DELETE CASCADE,
  content       TEXT,
  generated_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS score_history (
  id              TEXT PRIMARY KEY,
  evaluation_id   TEXT REFERENCES evaluations(id) ON DELETE CASCADE,
  rrs_score       REAL NOT NULL,
  rating          TEXT,
  dimension_scores TEXT,
  geo_score       REAL,
  gmb_score       REAL,
  composite_score REAL,
  recorded_at     TEXT DEFAULT (datetime('now'))
);

-- Page content captured during a crawl.
--
-- The evidence table stores aggregate indicator values (counts, booleans), which
-- cannot answer "does this page address question X". Coverage analysis needs the
-- text itself, so every crawled page is persisted here alongside the headings and
-- date signals that drive extractability and freshness scoring.
CREATE TABLE IF NOT EXISTS page_content (
  id             TEXT PRIMARY KEY,
  evaluation_id  TEXT REFERENCES evaluations(id) ON DELETE CASCADE,
  competitor_id  TEXT REFERENCES competitors(id) ON DELETE CASCADE,
  url            TEXT NOT NULL,
  title          TEXT,
  meta_desc      TEXT,
  headings       TEXT,           -- JSON: [{level: 1|2|3|4, text: string}]
  main_text      TEXT,           -- extracted body copy, boilerplate stripped
  sections       TEXT,           -- JSON: [{level, heading, text, wordCount}] — the retrieval unit
  word_count     INTEGER,
  has_ordered_list INTEGER DEFAULT 0,
  has_table        INTEGER DEFAULT 0,
  published_at   TEXT,           -- from schema.org / <time> / meta tags, when present
  modified_at    TEXT,
  rendered       INTEGER DEFAULT 0,
  crawled_at     TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_page_content_eval ON page_content(evaluation_id);
CREATE INDEX IF NOT EXISTS idx_page_content_comp ON page_content(competitor_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_page_content_comp_url ON page_content(competitor_id, url);

-- Sub-intents: the actual questions people ask around a topic.
--
-- Demand side of coverage analysis. Sourced from public autocomplete (real query
-- strings, locale-aware) and from competitor headings (what the field chose to
-- answer). Deliberately keyless — no LLM is needed to *find* the questions, only
-- later to judge whether a page answers one.
CREATE TABLE IF NOT EXISTS sub_intents (
  id            TEXT PRIMARY KEY,
  evaluation_id TEXT REFERENCES evaluations(id) ON DELETE CASCADE,
  question      TEXT NOT NULL,
  -- Illustrative, NOT enforced: this column is plain TEXT with no CHECK constraint, so a new
  -- source needs no migration. Known values:
  --   autocomplete_google | autocomplete_ddg  discovered by query expansion
  --   competitor_heading                      lifted from a rival's page structure
  --   ai_fanout                               a sub-query an assistant actually issued
  --   manual                                  typed in by a human; never auto-deleted
  source        TEXT NOT NULL,
  seed          TEXT,            -- the expansion seed that surfaced it
  locale        TEXT,            -- e.g. "en-ph" for Google results
  is_question   INTEGER DEFAULT 0,
  created_at    TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sub_intents_eval ON sub_intents(evaluation_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sub_intents_eval_q ON sub_intents(evaluation_id, question);

CREATE INDEX IF NOT EXISTS idx_evaluations_project ON evaluations(project_id);
CREATE INDEX IF NOT EXISTS idx_competitors_eval ON competitors(evaluation_id);
CREATE INDEX IF NOT EXISTS idx_evidence_eval ON evidence(evaluation_id);
CREATE INDEX IF NOT EXISTS idx_evidence_comp ON evidence(competitor_id);
CREATE INDEX IF NOT EXISTS idx_dim_scores_eval ON dimension_scores(evaluation_id);
CREATE INDEX IF NOT EXISTS idx_findings_eval ON findings(evaluation_id);
CREATE INDEX IF NOT EXISTS idx_recs_eval ON recommendations(evaluation_id);
CREATE INDEX IF NOT EXISTS idx_missions_eval ON missions(evaluation_id);
CREATE INDEX IF NOT EXISTS idx_tasks_mission ON mission_tasks(mission_id);
CREATE INDEX IF NOT EXISTS idx_score_history_eval ON score_history(evaluation_id);

-- Add target_score column to projects (safe if already exists)
-- Note: SQLite doesn't support IF NOT EXISTS for ALTER TABLE, so we use a pragma check approach
-- This is handled in db.ts init

-- GMB Analysis tables
CREATE TABLE IF NOT EXISTS gmb_audits (
  id              TEXT PRIMARY KEY,
  project_id      TEXT REFERENCES projects(id) ON DELETE CASCADE,
  evaluation_id   TEXT REFERENCES evaluations(id) ON DELETE CASCADE,
  search_query    TEXT NOT NULL,
  location        TEXT NOT NULL,
  lps_score       REAL,
  rating          TEXT,
  your_rank       INTEGER,
  total_found     INTEGER,
  avg_rating      REAL,
  avg_review_count INTEGER,
  findings_json   TEXT,
  recommendations_json TEXT,
  created_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS gmb_businesses (
  id              TEXT PRIMARY KEY,
  gmb_audit_id    TEXT REFERENCES gmb_audits(id) ON DELETE CASCADE,
  place_id        TEXT,
  name            TEXT NOT NULL,
  address         TEXT,
  phone           TEXT,
  website         TEXT,
  rating          REAL,
  reviews_count   INTEGER,
  category_name   TEXT,
  categories      TEXT,
  is_open         INTEGER DEFAULT 1,
  opening_hours   TEXT,
  latitude        REAL,
  longitude       REAL,
  url             TEXT,
  photo_count     INTEGER DEFAULT 0,
  question_count  INTEGER DEFAULT 0,
  description     TEXT,
  city            TEXT,
  state           TEXT,
  postal_code     TEXT,
  price_level     TEXT,
  permanently_closed INTEGER DEFAULT 0,
  rank            INTEGER,
  is_your_business INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_gmb_audits_project ON gmb_audits(project_id);
CREATE INDEX IF NOT EXISTS idx_gmb_businesses_audit ON gmb_businesses(gmb_audit_id);

-- Coverage verdicts: per (evaluation × competitor × sub-intent) assessment.
--
-- Persisting verdicts makes them diffable week to week — you can see whether a
-- competitor newly answered a question, or whether your own coverage improved after
-- shipping content. Written by the analysis endpoint, read by the coverage matrix UI.
CREATE TABLE IF NOT EXISTS coverage (
  id              TEXT PRIMARY KEY,
  evaluation_id   TEXT REFERENCES evaluations(id) ON DELETE CASCADE,
  competitor_id   TEXT NOT NULL,   -- competitor id or "self:<host>"
  competitor_label TEXT NOT NULL,  -- hostname or "Self"
  question        TEXT NOT NULL,
  answer_type     TEXT NOT NULL,   -- money | duration | count | steps | comparison | entity | boolean | definition
  level           TEXT NOT NULL,   -- none | lexical | answered
  score           REAL DEFAULT 0,  -- BM25 best passage score
  term_coverage   REAL DEFAULT 0,  -- fraction of question concepts present
  specificity     REAL DEFAULT 0,  -- 0–100 quotability score
  is_depth_gap    INTEGER DEFAULT 0,
  passage         TEXT,            -- best-matching passage or gap evidence
  heading         TEXT,            -- heading the passage sits under
  gap_evidence    TEXT,            -- passage that approaches the dimension without delivering
  subject_coverage REAL DEFAULT 0,  -- share of the question's subject terms present
  source_url      TEXT,            -- the page the verdict came from: the citation candidate
  source_title    TEXT,
  run_id          TEXT REFERENCES coverage_runs(id) ON DELETE CASCADE,
  scored_at       TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_coverage_eval ON coverage(evaluation_id);
CREATE INDEX IF NOT EXISTS idx_coverage_comp ON coverage(competitor_id);
-- The run-scoped indexes are created in db.ts instead, after the column migration.
-- Declaring them here would run before `ALTER TABLE coverage ADD COLUMN run_id` on an
-- existing database and fail with "no such column".

-- Coverage runs: one row per analysis pass, so verdicts accumulate instead of
-- replacing each other.
--
-- `engine_version` is load-bearing rather than bookkeeping. A change to the coverage
-- algorithm shifts verdicts across the whole corpus, and without a version stamp that
-- shift is indistinguishable from the client's content improving. Runs whose version
-- differs are a re-baseline and must be excluded from velocity and progress claims.
CREATE TABLE IF NOT EXISTS coverage_runs (
  id             TEXT PRIMARY KEY,
  evaluation_id  TEXT REFERENCES evaluations(id) ON DELETE CASCADE,
  ran_at         TEXT DEFAULT (datetime('now')),
  questions      INTEGER DEFAULT 0,   -- breadth, so two runs are comparable
  sites          INTEGER DEFAULT 0,
  engine_version TEXT
);

CREATE INDEX IF NOT EXISTS idx_coverage_runs_eval ON coverage_runs(evaluation_id, ran_at);

-- Content briefs: per-weakness actionable writing instructions.
--
-- Each brief tells the user exactly what to write to close a gap: the target question,
-- the required answer type, the evidence format, and a Claude-drafted starting point.
CREATE TABLE IF NOT EXISTS content_briefs (
  id              TEXT PRIMARY KEY,
  evaluation_id   TEXT REFERENCES evaluations(id) ON DELETE CASCADE,
  question        TEXT NOT NULL,
  answer_type     TEXT NOT NULL,
  weakness_score  INTEGER DEFAULT 0,
  severity        REAL DEFAULT 0,
  demand          REAL DEFAULT 0,
  winnability     REAL DEFAULT 0,
  effort          TEXT,
  rationale       TEXT,
  evidence        TEXT,
  target_heading  TEXT,            -- suggested H1/H2 for the new content
  required_format TEXT,            -- e.g. "price range with currency symbol"
  extractability_notes TEXT,       -- how to make the passage self-contained
  draft_content   TEXT,            -- the working draft: ours until the user edits it
  draft_generated TEXT,            -- exactly what we last generated, so an edit is provable
  status          TEXT DEFAULT 'pending',  -- pending | drafted | shipped | verified
  created_at      TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_briefs_eval ON content_briefs(evaluation_id);

-- AI answer capture: observed citations from real AI engines.
--
-- Ground truth for calibrating the citation prediction weights, and the basis for
-- Citation Share — the headline metric that replaces RRS as the primary score.
CREATE TABLE IF NOT EXISTS ai_queries (
  id              TEXT PRIMARY KEY,
  project_id      TEXT REFERENCES projects(id) ON DELETE CASCADE,
  query           TEXT NOT NULL,
  engine          TEXT NOT NULL,   -- claude | perplexity | google_ai_overview
  tracked         INTEGER DEFAULT 1,
  created_at      TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ai_queries_project ON ai_queries(project_id);

CREATE TABLE IF NOT EXISTS ai_answers (
  id              TEXT PRIMARY KEY,
  ai_query_id     TEXT REFERENCES ai_queries(id) ON DELETE CASCADE,
  project_id      TEXT REFERENCES projects(id) ON DELETE CASCADE,
  engine          TEXT NOT NULL,
  query           TEXT NOT NULL,
  answer_text     TEXT,
  fan_out_queries TEXT,            -- JSON array of sub-queries the engine issued
  -- Token accounting. The commercial argument in BUILD-PLAN rests on near-zero marginal
  -- cost per audit, which was trivially true while nothing called an API. Now that capture
  -- is on the critical path, the cost has to be visible per run or "keep it cheap" is a
  -- wish rather than a constraint.
  input_tokens         INTEGER,
  output_tokens        INTEGER,
  cache_read_tokens    INTEGER,
  cache_write_tokens   INTEGER,
  model                TEXT,
  captured_at     TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ai_answers_query ON ai_answers(ai_query_id);
CREATE INDEX IF NOT EXISTS idx_ai_answers_project ON ai_answers(project_id);

CREATE TABLE IF NOT EXISTS ai_citations (
  id              TEXT PRIMARY KEY,
  ai_answer_id    TEXT REFERENCES ai_answers(id) ON DELETE CASCADE,
  project_id      TEXT REFERENCES projects(id) ON DELETE CASCADE,
  url             TEXT NOT NULL,
  quoted_passage  TEXT,
  position        INTEGER,         -- 1-based citation position
  is_self         INTEGER DEFAULT 0,  -- 1 if this citation is the user's own site
  captured_at     TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ai_citations_answer ON ai_citations(ai_answer_id);
CREATE INDEX IF NOT EXISTS idx_ai_citations_project ON ai_citations(project_id);

-- Outcome loop: tracks whether shipping a content brief actually gained citations.
CREATE TABLE IF NOT EXISTS outcomes (
  id              TEXT PRIMARY KEY,
  project_id      TEXT REFERENCES projects(id) ON DELETE CASCADE,
  content_brief_id TEXT REFERENCES content_briefs(id),
  question        TEXT NOT NULL,
  shipped_at      TEXT,
  citation_before INTEGER DEFAULT 0,  -- was self cited before shipping?
  citation_after  INTEGER DEFAULT 0,  -- was self cited after re-running?
  -- The verdict half of the same loop. Moves first and needs no AI capture, so an outcome
  -- can be proven from a crawl alone while the citation half waits on a captured answer.
  verdict_before  TEXT,
  verdict_after   TEXT,
  specificity_before REAL,
  specificity_after  REAL,
  measured_at     TEXT,
  created_at      TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_outcomes_project ON outcomes(project_id);

-- Citation snapshots: Citation Share % per project, recorded after each AI capture run.
-- Enables tracking AI visibility trends over time alongside score history.
CREATE TABLE IF NOT EXISTS citation_snapshots (
  id              TEXT PRIMARY KEY,
  project_id      TEXT REFERENCES projects(id) ON DELETE CASCADE,
  total_queries   INTEGER NOT NULL,
  cited_queries   INTEGER NOT NULL,
  citation_share  REAL NOT NULL,
  per_engine      TEXT,           -- JSON: [{engine, total, cited, share}]
  recorded_at     TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_citation_snapshots_project ON citation_snapshots(project_id);
