import { NextRequest, NextResponse } from "next/server";
import { logout, logoutEverywhere, SESSION_COOKIE } from "@/lib/auth";
import { currentUser } from "@/lib/session";

/**
 * POST /api/auth/logout — ends this session.
 * POST /api/auth/logout?everywhere=1 — ends every session for the account.
 *
 * Deleting the row is what makes logout real. A signed token would stay valid until it expired,
 * so "log out" would be a suggestion rather than an action.
 */
export async function POST(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;

  let ended = 1;
  if (req.nextUrl.searchParams.get("everywhere") === "1") {
    const user = await currentUser();
    ended = user ? await logoutEverywhere(user.id) : 0;
  } else {
    await logout(token);
  }

  const response = NextResponse.json({ ok: true, sessions_ended: ended });
  // Clear the cookie as well as the row. Leaving it set means every later request carries a
  // token that no longer works, which reads as a broken app rather than a logged-out one.
  response.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}
