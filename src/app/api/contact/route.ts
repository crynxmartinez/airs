import { NextRequest, NextResponse } from "next/server";
import { run, generateId } from "@/lib/db";

/**
 * POST /api/contact — the only public write endpoint.
 *
 * Messages are stored, not emailed. No mail service means no extra account, no extra secret, and
 * nothing to break silently at 2am. **The trade is real: nothing notifies you.** Read them at
 * `/messages`, which sits behind the login.
 *
 * Being public and a write, this is the one route a stranger can use to put rows in the
 * database, so the limits below are the whole security story for it.
 */

const MAX_NAME = 120;
const MAX_EMAIL = 200;
const MAX_COMPANY = 160;
const MAX_MESSAGE = 4000;
const MIN_MESSAGE = 10;

/**
 * Submissions per IP per hour.
 *
 * In-process, so it resets on restart and does not span instances. Worth having anyway: it turns
 * an unattended flood into a handful of rows. A shared store is the upgrade if this ever runs on
 * more than one instance.
 */
const MAX_PER_HOUR = 5;
const WINDOW_MS = 3_600_000;
const submissions = new Map<string, { count: number; resetAt: number }>();

function overLimit(ip: string): boolean {
  const now = Date.now();
  const entry = submissions.get(ip);

  if (!entry || now > entry.resetAt) {
    submissions.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    if (submissions.size > 10_000) {
      for (const [key, value] of submissions) if (now > value.resetAt) submissions.delete(key);
    }
    return false;
  }

  entry.count += 1;
  return entry.count > MAX_PER_HOUR;
}

function trimmed(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("x-real-ip") ||
    "local";

  if (overLimit(ip)) {
    return NextResponse.json(
      { error: "Too many messages from this address. Try again later." },
      { status: 429 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }

  // Honeypot: a field that is invisible to people and irresistible to form-filling bots. Anything
  // in it means a bot, so accept the request and store nothing — a 400 would tell the bot's
  // author the trap exists, and they would remove the field on the next pass.
  if (trimmed(body.website, 200) !== "") {
    return NextResponse.json({ ok: true });
  }

  const name = trimmed(body.name, MAX_NAME);
  const email = trimmed(body.email, MAX_EMAIL).toLowerCase();
  const company = trimmed(body.company, MAX_COMPANY);
  const message = trimmed(body.message, MAX_MESSAGE);

  if (!name || !email || !message) {
    return NextResponse.json({ error: "Name, email and message are required." }, { status: 400 });
  }
  // Deliberately loose. Real addresses take shapes a strict pattern rejects, and turning away a
  // genuine prospect over a regex costs far more than storing one bad address.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "That email address does not look right." }, { status: 400 });
  }
  if (message.length < MIN_MESSAGE) {
    return NextResponse.json({ error: "Please say a little more." }, { status: 400 });
  }

  await run(
    `INSERT INTO contact_messages (id, name, email, company, message, source_ip)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [generateId(), name, email, company || null, message, ip.slice(0, 60)]
  );

  return NextResponse.json({ ok: true });
}
