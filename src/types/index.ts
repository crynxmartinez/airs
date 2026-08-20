export interface Project {
  id: string;
  name: string;
  description: string | null;
  target_location: string | null;
  target_score: number | null;
  created_at: string;
}

export interface Evaluation {
  id: string;
  project_id: string | null;
  primary_query: string;
  search_intent: "informational" | "transactional" | "navigational";
  digital_asset_url: string;
  target_audience: string | null;
  /** Market this evaluation targets. Drives the competitor-search region. */
  target_location: string | null;
  scope: string | null;
  status: "draft" | "in_progress" | "completed";
  rrs_score: number | null;
  confidence_score: number | null;
  rating: "platinum" | "gold" | "silver" | "bronze" | "foundation" | null;
  created_at: string;
  updated_at: string;
}

export interface Competitor {
  id: string;
  evaluation_id: string;
  url: string;
  competitor_name: string | null;
  title: string | null;
  description: string | null;
  /** "self" is your own digital asset, scored through the same pipeline but never counted as part of the competitive field. */
  competitor_type: "self" | "direct" | "functional" | "platform" | "informational" | "ai_generated" | null;
  score: number | null;
  created_at: string;
}

export interface Evidence {
  id: string;
  evaluation_id: string;
  competitor_id: string;
  category: "structural" | "content" | "trust" | "ux" | "technical" | "competitive" | "ecosystem";
  indicator_code: string | null;
  observation: string;
  source_url: string | null;
  evidence_type: "direct_observation" | "audit" | "comparison" | "documentation" | null;
  confidence_level: "A" | "B" | "C" | "D" | null;
  value: string | null;
  collected_at: string;
}

export interface DimensionScore {
  id: string;
  evaluation_id: string;
  competitor_id: string;
  dimension_code: "D1" | "D2" | "D3" | "D4" | "D5" | "D6" | "D7";
  score: number;
  max_score: number;
}

export interface Finding {
  id: string;
  evaluation_id: string;
  competitor_id: string | null;
  type: "weakness" | "strength" | "gap" | "opportunity" | "standard";
  dimension_code: string | null;
  factor_code: string | null;
  description: string;
  impact_level: "high" | "medium" | "low" | null;
  evidence_ids: string | null;
}

export interface Recommendation {
  id: string;
  evaluation_id: string;
  title: string;
  description: string | null;
  priority: "high" | "medium" | "low" | null;
  effort: "low" | "medium" | "high" | null;
  expected_impact: string | null;
  finding_ids: string | null;
  created_at: string;
}

export interface Mission {
  id: string;
  evaluation_id: string;
  name: string;
  status: "active" | "completed" | "inactive";
  created_at: string;
  completed_at: string | null;
}

export interface MissionTask {
  id: string;
  mission_id: string;
  recommendation_id: string | null;
  title: string;
  description: string | null;
  phase: string | null;
  indicator_code: string | null;
  status: "todo" | "in_progress" | "done";
  completed_at: string | null;
  content_brief_id: string | null;
  source: string;
  priority_score: number;
}

export interface Report {
  id: string;
  evaluation_id: string;
  content: string | null;
  generated_at: string;
}

export interface EvaluationWithDetails extends Evaluation {
  competitors: Competitor[];
  evidence_count: number;
  finding_count: number;
  recommendation_count: number;
}

export interface ContentBrief {
  id: string;
  evaluation_id: string;
  question: string;
  answer_type: string;
  weakness_score: number;
  severity: number;
  demand: number;
  winnability: number;
  effort: string;
  rationale: string;
  evidence: string | null;
  target_heading: string | null;
  required_format: string | null;
  extractability_notes: string | null;
  draft_content: string | null;
  draft_generated: string | null;
  status: string;
  created_at: string;
}

export interface SearchCitation {
  id: string;
  project_id: string;
  query: string;
  engine: string;
  result_url: string;
  result_title: string | null;
  result_position: number | null;
  is_self: number;
  found_at: string;
}

export interface GeneratedContent {
  content: string;
  wordCount: number;
  style: string;
  sources: { title: string; url: string }[];
  selfCitations: number;
  generatedAt: string;
}

export interface CitationDashboard {
  ai: {
    totalQueries: number;
    citedQueries: number;
    citationShare: number;
    perEngine: { engine: string; total: number; cited: number; share: number }[];
  };
  google: {
    questions: {
      query: string;
      cited: number;
      total: number;
      pages: { url: string; title: string | null; position: number; isSelf: boolean }[];
    }[];
    overallCited: number;
    overallTotal: number;
  };
  history: { date: string; aiShare: number; googleShare: number }[];
}
