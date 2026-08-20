// Row counts per table, for a quick look at what the database actually holds.
//
// Uses node:sqlite rather than better-sqlite3: the latter's prebuilt binary is
// unsigned and Windows Smart App Control blocks it intermittently, which made this
// script fail with ERR_DLOPEN_FAILED exactly when you most wanted to check the data.
const { DatabaseSync } = require('node:sqlite');

const db = new DatabaseSync('./airs.db');

const tables = [
  'projects',
  'evaluations',
  'missions',
  'competitors',
  'page_content',
  'coverage',
  'content_briefs',
  'score_history',
  'outcomes',
  'citation_snapshots',
  'ai_queries',
  'ai_answers',
  'ai_citations',
  'sub_intents',
  'gmb_audits',
  'gmb_businesses',
  'findings',
  'recommendations',
  'coverage_runs',
];

for (const t of tables) {
  try {
    const c = db.prepare("SELECT COUNT(*) as cnt FROM " + t).get();
    console.log(t + ": " + c.cnt);
  } catch (e) {
    console.log(t + ": N/A");
  }
}

db.close();
