-- AIRS CRM Database Schema (Postgres)

CREATE TABLE IF NOT EXISTS projects (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  description     TEXT,
  target_location TEXT,
  target_score    INTEGER DEFAULT 80,
  created_at      TEXT DEFAULT (to_char(NOW(), 'YYYY-MM-DD HH24:MI:SS'))
);

CREATE TABLE IF NOT EXISTS evaluations (
  id                TEXT PRIMARY KEY,
  project_id        TEXT REFERENCES projects(id) ON DELETE CASCADE,
  primary_query     TEXT NOT NULL,
  search_intent     TEXT NOT NULL DEFAULT '',
  digital_asset_url TEXT NOT NULL,
  target_audience   TEXT,
  target_location   TEXT,
  scope             TEXT,
  status            TEXT DEFAULT 'draft',
  rrs_score         REAL,
  confidence_score  REAL,
  rating            TEXT,
  created_at        TEXT DEFAULT (to_char(NOW(), 'YYYY-MM-DD HH24:MI:SS')),
  updated_at        TEXT DEFAULT (to_char(NOW(), 'YYYY-MM-DD HH24:MI:SS'))
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
  created_at      TEXT DEFAULT (to_char(NOW(), 'YYYY-MM-DD HH24:MI:SS')),
  discovered_via  TEXT
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
  collected_at     TEXT DEFAULT (to_char(NOW(), 'YYYY-MM-DD HH24:MI:SS'))
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
  created_at      TEXT DEFAULT (to_char(NOW(), 'YYYY-MM-DD HH24:MI:SS'))
);

CREATE TABLE IF NOT EXISTS missions (
  id            TEXT PRIMARY KEY,
  evaluation_id TEXT REFERENCES evaluations(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  status        TEXT DEFAULT 'active',
  audit_data    TEXT,
  created_at    TEXT DEFAULT (to_char(NOW(), 'YYYY-MM-DD HH24:MI:SS')),
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
  generated_at  TEXT DEFAULT (to_char(NOW(), 'YYYY-MM-DD HH24:MI:SS'))
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
  recorded_at     TEXT DEFAULT (to_char(NOW(), 'YYYY-MM-DD HH24:MI:SS'))
);

CREATE TABLE IF NOT EXISTS page_content (
  id             TEXT PRIMARY KEY,
  evaluation_id  TEXT REFERENCES evaluations(id) ON DELETE CASCADE,
  competitor_id  TEXT REFERENCES competitors(id) ON DELETE CASCADE,
  url            TEXT NOT NULL,
  title          TEXT,
  meta_desc      TEXT,
  headings       TEXT,
  main_text      TEXT,
  sections       TEXT,
  word_count     INTEGER,
  has_ordered_list INTEGER DEFAULT 0,
  has_table        INTEGER DEFAULT 0,
  published_at   TEXT,
  modified_at    TEXT,
  rendered       INTEGER DEFAULT 0,
  crawled_at     TEXT DEFAULT (to_char(NOW(), 'YYYY-MM-DD HH24:MI:SS'))
);

CREATE INDEX IF NOT EXISTS idx_page_content_eval ON page_content(evaluation_id);
CREATE INDEX IF NOT EXISTS idx_page_content_comp ON page_content(competitor_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_page_content_comp_url ON page_content(competitor_id, url);

CREATE TABLE IF NOT EXISTS sub_intents (
  id            TEXT PRIMARY KEY,
  evaluation_id TEXT REFERENCES evaluations(id) ON DELETE CASCADE,
  question      TEXT NOT NULL,
  source        TEXT NOT NULL,
  seed          TEXT,
  locale        TEXT,
  is_question   INTEGER DEFAULT 0,
  created_at    TEXT DEFAULT (to_char(NOW(), 'YYYY-MM-DD HH24:MI:SS'))
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
  created_at      TEXT DEFAULT (to_char(NOW(), 'YYYY-MM-DD HH24:MI:SS'))
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

CREATE TABLE IF NOT EXISTS coverage_runs (
  id             TEXT PRIMARY KEY,
  evaluation_id  TEXT REFERENCES evaluations(id) ON DELETE CASCADE,
  ran_at         TEXT DEFAULT (to_char(NOW(), 'YYYY-MM-DD HH24:MI:SS')),
  questions      INTEGER DEFAULT 0,
  sites          INTEGER DEFAULT 0,
  engine_version TEXT
);

CREATE INDEX IF NOT EXISTS idx_coverage_runs_eval ON coverage_runs(evaluation_id, ran_at);

CREATE TABLE IF NOT EXISTS coverage (
  id              TEXT PRIMARY KEY,
  evaluation_id   TEXT REFERENCES evaluations(id) ON DELETE CASCADE,
  competitor_id   TEXT NOT NULL,
  competitor_label TEXT NOT NULL,
  question        TEXT NOT NULL,
  answer_type     TEXT NOT NULL,
  level           TEXT NOT NULL,
  score           REAL DEFAULT 0,
  term_coverage   REAL DEFAULT 0,
  specificity     REAL DEFAULT 0,
  is_depth_gap    INTEGER DEFAULT 0,
  passage         TEXT,
  heading         TEXT,
  gap_evidence    TEXT,
  subject_coverage REAL DEFAULT 0,
  source_url      TEXT,
  source_title    TEXT,
  run_id          TEXT REFERENCES coverage_runs(id) ON DELETE CASCADE,
  scored_at       TEXT DEFAULT (to_char(NOW(), 'YYYY-MM-DD HH24:MI:SS'))
);

CREATE INDEX IF NOT EXISTS idx_coverage_eval ON coverage(evaluation_id);
CREATE INDEX IF NOT EXISTS idx_coverage_comp ON coverage(competitor_id);
CREATE INDEX IF NOT EXISTS idx_coverage_run ON coverage(run_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_coverage_run_comp_q ON coverage(run_id, competitor_id, question);

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
  target_heading  TEXT,
  required_format TEXT,
  extractability_notes TEXT,
  draft_content   TEXT,
  draft_generated TEXT,
  status          TEXT DEFAULT 'pending',
  created_at      TEXT DEFAULT (to_char(NOW(), 'YYYY-MM-DD HH24:MI:SS'))
);

CREATE INDEX IF NOT EXISTS idx_briefs_eval ON content_briefs(evaluation_id);

CREATE TABLE IF NOT EXISTS ai_queries (
  id              TEXT PRIMARY KEY,
  project_id      TEXT REFERENCES projects(id) ON DELETE CASCADE,
  query           TEXT NOT NULL,
  engine          TEXT NOT NULL,
  tracked         INTEGER DEFAULT 1,
  created_at      TEXT DEFAULT (to_char(NOW(), 'YYYY-MM-DD HH24:MI:SS'))
);

CREATE INDEX IF NOT EXISTS idx_ai_queries_project ON ai_queries(project_id);

CREATE TABLE IF NOT EXISTS ai_answers (
  id              TEXT PRIMARY KEY,
  ai_query_id     TEXT REFERENCES ai_queries(id) ON DELETE CASCADE,
  project_id      TEXT REFERENCES projects(id) ON DELETE CASCADE,
  engine          TEXT NOT NULL,
  query           TEXT NOT NULL,
  answer_text     TEXT,
  fan_out_queries TEXT,
  input_tokens    INTEGER,
  output_tokens   INTEGER,
  cache_read_tokens INTEGER,
  cache_write_tokens INTEGER,
  model           TEXT,
  capture_group_id TEXT,
  captured_at     TEXT DEFAULT (to_char(NOW(), 'YYYY-MM-DD HH24:MI:SS'))
);

CREATE INDEX IF NOT EXISTS idx_ai_answers_query ON ai_answers(ai_query_id);
CREATE INDEX IF NOT EXISTS idx_ai_answers_project ON ai_answers(project_id);
CREATE INDEX IF NOT EXISTS idx_ai_answers_group ON ai_answers(capture_group_id);

CREATE TABLE IF NOT EXISTS ai_citations (
  id              TEXT PRIMARY KEY,
  ai_answer_id    TEXT REFERENCES ai_answers(id) ON DELETE CASCADE,
  project_id      TEXT REFERENCES projects(id) ON DELETE CASCADE,
  url             TEXT NOT NULL,
  quoted_passage  TEXT,
  position        INTEGER,
  is_self         INTEGER DEFAULT 0,
  captured_at     TEXT DEFAULT (to_char(NOW(), 'YYYY-MM-DD HH24:MI:SS'))
);

CREATE INDEX IF NOT EXISTS idx_ai_citations_answer ON ai_citations(ai_answer_id);
CREATE INDEX IF NOT EXISTS idx_ai_citations_project ON ai_citations(project_id);

CREATE TABLE IF NOT EXISTS outcomes (
  id              TEXT PRIMARY KEY,
  project_id      TEXT REFERENCES projects(id) ON DELETE CASCADE,
  content_brief_id TEXT REFERENCES content_briefs(id),
  question        TEXT NOT NULL,
  shipped_at      TEXT,
  citation_before INTEGER DEFAULT 0,
  citation_after  INTEGER DEFAULT 0,
  verdict_before  TEXT,
  verdict_after   TEXT,
  specificity_before REAL,
  specificity_after  REAL,
  measured_at     TEXT,
  created_at      TEXT DEFAULT (to_char(NOW(), 'YYYY-MM-DD HH24:MI:SS'))
);

CREATE INDEX IF NOT EXISTS idx_outcomes_project ON outcomes(project_id);

CREATE TABLE IF NOT EXISTS citation_snapshots (
  id              TEXT PRIMARY KEY,
  project_id      TEXT REFERENCES projects(id) ON DELETE CASCADE,
  total_queries   INTEGER NOT NULL,
  cited_queries   INTEGER NOT NULL,
  citation_share  REAL NOT NULL,
  per_engine      TEXT,
  recorded_at     TEXT DEFAULT (to_char(NOW(), 'YYYY-MM-DD HH24:MI:SS'))
);

CREATE INDEX IF NOT EXISTS idx_citation_snapshots_project ON citation_snapshots(project_id);
