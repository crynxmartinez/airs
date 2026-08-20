import { NextRequest, NextResponse } from "next/server";
import { query, run, generateId } from "@/lib/db";
import { auditWebsite } from "@/lib/audit";
import type { MissionTask } from "@/types";

// Map audit check names to indicator codes for auto-verification
const CHECK_TO_INDICATOR: Record<string, string> = {
  "HTTPS / SSL": "https",
  "Page Loading Speed": "speed",
  "HTML Page Size": "page_size",
  "Canonical Tag": "canonical",
  "Robots Meta Tag": "robots",
  "H1 Heading": "h1",
  "Heading Hierarchy (H2/H3)": "h2",
  "Schema.org Structured Data": "schema",
  "Navigation Menu": "nav",
  "Title Tag": "title_tag",
  "Meta Description": "meta_desc",
  "Mobile Viewport": "viewport",
  "Open Graph Tags": "og_tags",
  "Content Depth (Word Count)": "word_count",
  "Pricing Information": "pricing",
  "FAQ Section": "faq",
  "Contact Information": "contact",
  "Reviews / Testimonials": "reviews",
  "License / Certification": "license",
  "Image Alt Text": "alt_text",
  "Internal Links": "internal_links",
  "Social Media Links": "social",
  "External Links": "external_links",
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: missionId } = await params;
  const { url } = await req.json();

  if (!url) {
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  }

  try {
    const result = await auditWebsite(url);

    // Remove generic audit tasks (from AUDIT_TASKS) — replace with real findings
    const genericTitles = [
      "Verify HTTPS and SSL certificate",
      "Audit heading structure (H1, H2, H3)",
      "Check page loading speed",
      "Verify meta tags (title, description, viewport)",
      "Add Schema.org structured data",
      "Check mobile responsiveness",
      "Self-audit: Compare your site to competitors",
    ];
    for (const title of genericTitles) {
      await run(
        "DELETE FROM mission_tasks WHERE mission_id = ? AND phase = 'phase1' AND title = ? AND status = 'todo'",
        [missionId, title]
      );
    }

    // Re-fetch after deletion
    const remainingTasks = await query<MissionTask>(
      "SELECT * FROM mission_tasks WHERE mission_id = ? AND phase = 'phase1'",
      [missionId]
    );
    const remainingTitles = new Set(remainingTasks.map((t) => t.title));

    // Create tasks from failed checks first, then warnings
    const failedChecks = result.checks.filter((c) => c.status === "fail");
    const warnChecks = result.checks.filter((c) => c.status === "warn");

    const createdTasks: MissionTask[] = [];

    for (const check of [...failedChecks, ...warnChecks]) {
      const taskTitle = check.name;
      if (remainingTitles.has(taskTitle)) continue;

      const indicatorCode = CHECK_TO_INDICATOR[check.name] || "";
      const description = `${check.detail}\n\nCurrent value: ${check.value}\n\nHow to fix: ${check.recommendation || "Review and address this issue."}`;

      const taskId = generateId();
      await run(
        "INSERT INTO mission_tasks (id, mission_id, recommendation_id, title, description, phase, indicator_code, status) VALUES (?, ?, NULL, ?, ?, 'phase1', ?, 'todo')",
        [taskId, missionId, taskTitle, description, indicatorCode]
      );

      createdTasks.push({
        id: taskId,
        mission_id: missionId,
        recommendation_id: null,
        title: taskTitle,
        description,
        phase: "phase1",
        indicator_code: indicatorCode,
        status: "todo",
        completed_at: null,
      });

      remainingTitles.add(taskTitle);
    }

    // Save audit result to mission for persistence across refreshes
    await run(
      "UPDATE missions SET audit_data = ? WHERE id = ?",
      [JSON.stringify(result), missionId]
    );

    // Return the audit result + created tasks count
    return NextResponse.json({
      ...result,
      tasks_created: createdTasks.length,
      created_tasks: createdTasks,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Self-audit failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
