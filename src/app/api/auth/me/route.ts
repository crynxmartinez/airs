import { NextResponse } from "next/server";
import { currentUser } from "@/lib/session";

/**
 * GET /api/auth/me — who is signed in, or null.
 *
 * Lets the UI show a name and a sign-out button without every page reading the cookie itself.
 * Returns 200 with `{ user: null }` rather than 401 when nobody is signed in: "not signed in" is
 * the answer to this question, not a failure to answer it.
 */
export async function GET() {
  return NextResponse.json({ user: await currentUser() });
}
