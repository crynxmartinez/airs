-- AIRS CRM Database Schema (SQLite)

CREATE TABLE IF NOT EXISTS projects (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  created_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS evaluations (
  id                TEXT PRIMARY KEY,
  project_id        TEXT REFERENCES projects(id) ON DELETE CASCADE,
  primary_query     TEXT NOT NULL,
  search_intent     TEXT NOT NULL,
  digital_asset_url TEXT NOT NULL,
  target_audience   TEXT,
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
  recorded_at     TEXT DEFAULT (datetime('now'))
);

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
