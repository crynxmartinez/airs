import { NextRequest, NextResponse } from "next/server";
import { verifyShippedBrief } from "@/lib/verify-brief";

/**
 * Verify a shipped brief against the page it was published on.
 *
 *   POST /api/briefs/[id]/verify  { "url": "https://client.com/pricing" }
 *
 * Re-crawls that URL and re-runs the same coverage engine that found the gap. `answered`
 * promotes the brief to `verified`; anything less holds it at `shipped` and returns why.
 *
 * The verdict is deliberately not a pass/fail. "Published, but the page still doesn't state
 * a figure" is the common outcome and the actionable one — it tells the writer the heading
 * landed and the commitment didn't.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const url: string | undefined = body?.url;

  if (!url) {
    return NextResponse.json(
      { error: "url is required — the page this brief was published on" },
      { status: 400 }
    );
  }

  try {
    const result = await verifyShippedBrief(id, url);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
