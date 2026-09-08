import { query, run } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { Mail } from "lucide-react";

/**
 * The contact inbox.
 *
 * The other half of storing messages instead of emailing them: without this page they would sit
 * in a table nobody looks at, which is worse than no form at all. **Nothing notifies you** — this
 * is the place you check.
 *
 * Behind the login. `requireUser()` rather than trusting `proxy.ts` alone: the Next docs are
 * explicit that the proxy should not be the only line of defence, and this page shows strangers'
 * email addresses.
 */

interface MessageRow {
  id: string;
  name: string;
  email: string;
  company: string | null;
  message: string;
  created_at: string;
  read_at: string | null;
}

export default async function MessagesPage() {
  await requireUser();

  const messages = await query<MessageRow>(
    `SELECT id, name, email, company, message, created_at, read_at
       FROM contact_messages ORDER BY created_at DESC LIMIT 200`
  );

  // Mark everything read on view. Simple and honest: opening the inbox is the act of reading it,
  // and a per-message "mark as read" button is busywork for an audience of one.
  const unreadIds = messages.filter((m) => !m.read_at).map((m) => m.id);
  if (unreadIds.length > 0) {
    await run(
      `UPDATE contact_messages SET read_at = to_char(NOW(), 'YYYY-MM-DD HH24:MI:SS')
        WHERE id IN (${unreadIds.map(() => "?").join(", ")})`,
      unreadIds
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex items-baseline justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Messages</h1>
        <span className="text-sm text-slate-500">
          {messages.length === 0
            ? "none yet"
            : `${messages.length} total${unreadIds.length > 0 ? ` · ${unreadIds.length} new` : ""}`}
        </span>
      </div>

      {messages.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center">
          <Mail className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-4 text-sm text-slate-500">
            Nothing from the contact form yet. Messages arrive here — there is no email
            notification, so this is the page to check.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {messages.map((m) => (
            <article
              key={m.id}
              className={`rounded-xl border bg-white p-5 ${
                m.read_at ? "border-slate-200" : "border-blue-200 bg-blue-50/40"
              }`}
            >
              <header className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <h2 className="font-medium text-slate-900">{m.name}</h2>
                  <a
                    href={`mailto:${m.email}`}
                    className="text-sm text-blue-600 hover:underline"
                  >
                    {m.email}
                  </a>
                  {m.company && (
                    <span className="ml-2 text-sm text-slate-500">· {m.company}</span>
                  )}
                </div>
                <time className="text-xs text-slate-400">{m.created_at}</time>
              </header>
              {/* `whitespace-pre-wrap` keeps the paragraphs someone typed. Rendered as text, never
                  as HTML — this is the one field on the site a stranger controls. */}
              <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                {m.message}
              </p>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
