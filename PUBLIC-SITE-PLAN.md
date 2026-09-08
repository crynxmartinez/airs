# Public site + login — plan

Add a public front (homepage, About, Contact) and put the existing app behind a login. No public
sign-up. One private registration page, for one account: mine.

**Status: ✅ BUILT 2026-09-08. See _What was actually built_ at the bottom.**

---

## First: this breaks a rule you wrote

`BUILD-PLAN.md` says, under **Do Not Build**:

| Auth, multi-tenancy, hosted deployment | Selling documents, not access |

And platform smell #1 is *"building for a stranger's trust"* — onboarding, marketing copy, error
messages written in full sentences. A homepage and an About page are exactly that.

**I think the rule is wrong for this one case.** The tell is "no registration". That instruction
only makes sense if strangers can reach the site. So this is not auth for imaginary users — it is
a **sales website**, with a private tool behind a locked door. Selling documents still needs
somewhere for an agency to find you.

What has not changed: no roles, no permissions, no teams, no invites, no password reset flow, no
"forgot password" email. One user. If that stays true, this stays small.

---

## The assumption everything below rests on

**This goes on the public internet.** If it is staying on localhost forever, stop — you do not
need any of this, and a login on localhost protects nothing.

If that assumption is wrong, say so, because it changes almost every decision here.

---

## ⚠️ The part that actually matters

Right now **every route in this app is wide open.** No login, no middleware, nothing.

There are **50 API routes**. Three of them spend your money:

```
/api/evaluations/[id]/ai-capture     ~$0.375 per call
/api/evaluations/[id]/discover       ~$0.375 per call
/api/projects/[id]/grid              ~$0.375 x questions x runs
```

Four of them fetch any URL you hand them:

```
/api/suggest
/api/evaluations/[id]/crawl
/api/evaluations/[id]/self
/api/missions/[id]/tasks/[taskId]/verify
```

Deploy this as-is and three things happen, none of them theoretical:

1. **Anyone can spend your Anthropic budget.** A loop against `/api/projects/x/grid` is a bill.
2. **Your app becomes an open proxy.** `/api/suggest` fetches whatever URL it is given and hands
   the page back. That is a free anonymous fetcher pointed at anything — including private
   addresses on whatever machine hosts this.
3. **Every client's data is public.** Evaluations, competitors, findings, briefs — all readable
   at a guessable URL.

`BUILD-PLAN.md` already predicted #2 and parked it: *"SSRF allowlist on /api/scrape + /api/crawl —
Only matters deployed. Localhost only."* **Deploying is the thing that un-parks it.**

So: **protecting the API is the job.** The login page is just the door you walk through. Putting a
password on the pages while leaving `/api/*` open would be security theatre.

---

## The pages

Four public pages, plus one private one.

| Page | Path | What it is |
|---|---|---|
| Homepage | `/` | What AIRS does, who it is for, one call to action. Today `/` just redirects to `/dashboard`. |
| About | `/about` | Who you are, why the method is different. |
| Contact | `/contact` | A form. See the note below about where messages go. |
| Login | `/login` | Email + password. Nothing else. |
| Register | `/register` | Private, one-time, locked two ways. See below. |

Everything already built (`/dashboard`, `/projects`, `/evaluations`, `/missions`, `/benchmarks`,
`/knowledge`, `/settings`, `/audit`) moves behind the login. No changes to those pages themselves.

### Layout: three chrome modes, not two

`src/components/app-chrome.tsx` already picks between two shells — the app shell (sidebar +
topbar) and a bare canvas for `/report` routes. It decides by looking at the pathname.

Add a third mode rather than restructuring:

- `document` — reports. Already exists. Untouched.
- `marketing` — public pages and login. Simple top nav (logo, About, Contact, Login), footer, no
  sidebar.
- `app` — everything else. Already exists. Untouched.

**Why not Next route groups (`(marketing)/`, `(app)/`)?** They are the more idiomatic way, and if
this were a new app I would use them. But it means moving eight existing route folders, and every
move is a chance to break an import or a link. Extending `AppChrome` is one file and one `if`.
The codebase already works this way; matching it beats being idiomatic here.

---

## Login — the simplest thing that is actually safe

### Password storage: `node:crypto` scrypt. No new dependency.

Not bcrypt, not argon2. Both need a compiled native binary, and this project has already been
bitten by exactly that: `better-sqlite3` had to be ripped out because Windows Smart App Control
blocked its unsigned prebuilt binary with `ERR_DLOPEN_FAILED`. `scrypt` ships inside Node, is a
genuine password hash (slow and memory-hard, which is the point), and cannot break on a machine
where Node runs.

Store `salt:hash`. Compare with `crypto.timingSafeEqual`, never `===`.

### Sessions: a random token in Postgres, not a JWT

A JWT cannot be revoked. A row can be deleted.

```
sessions
  id          text primary key     -- 32 random bytes, hex
  user_id     text -> users(id)
  created_at  timestamptz
  expires_at  timestamptz
```

The token goes in a cookie: `httpOnly`, `secure`, `sameSite=lax`, 30-day expiry. `httpOnly` means
page scripts cannot read it, so an injected script cannot steal your session.

Logging out deletes the row. Losing your laptop means one `DELETE` and every session is dead.

### Why not next-auth / Auth.js

It is built for many users and many OAuth providers. You have one user and no providers. It would
be the largest dependency in the project, to do less than 100 lines of your own code.

### The gate: `src/middleware.ts`

One file, and it must default to **closed**:

```
PUBLIC = ["/", "/about", "/contact", "/login", "/register", "/api/auth/*"]

if path is PUBLIC        -> allow
if valid session cookie  -> allow
if path starts /api/     -> 401 JSON
else                     -> redirect to /login
```

The list is what is **open**, not what is closed. Every route added later is protected by
default. An allowlist fails safe; a blocklist fails open, and the failure is silent.

**The API must return 401, not a redirect.** A `fetch()` that receives a login page as HTML and
tries to `JSON.parse` it produces a confusing error a long way from the cause.

⚠️ **Middleware alone is not enough for the three routes that spend money.** Check the session
inside those handlers too. Middleware is one config change away from being bypassed, and the
consequence here is a bill rather than a bug. Belt and braces, only where it pays.

---

## Registration "just for me"

A `/register` page on the public internet is a door. Two locks, both required:

1. **A secret token.** `SIGNUP_TOKEN` in `.env.local`. The form needs it. No token, no account.
2. **Only when there are zero users.** Once one account exists, the route returns 403 forever.

Lock 2 is the one that matters, because it means **you cannot forget to remove the page.** After
you register, it is dead by itself. No "delete this later" note that never gets actioned.

Rate-limit the login route too — a few attempts per minute per IP. One user means any burst of
attempts is someone guessing.

---

## Contact form — where do messages go?

No email service is set up, and adding one means a new dependency, an account, and another secret.

**Recommendation: store messages in Postgres and read them inside the app.**

```
contact_messages
  id, name, email, message, created_at, read_at
```

They show up on a page behind your login. **The honest downside: nothing notifies you.** You have
to look. For the volume a new site gets, looking is fine — and it can be upgraded to email later
without changing the form.

Add a honeypot field and a minimum time-on-page check. Bots find contact forms within days of a
domain going live. Not a captcha — that is a stranger-trust feature and it annoys real people.

---

## One decision I need from you

**Should `/audit` stay public as a free lead magnet?**

There is already a "Website Audit" page. Public, it is a strong hook — a stranger tries it, sees
real output, contacts you. That is worth more than any About page.

But I have not checked whether it spends money per run. If it does, public means strangers spend
your budget, and it must go behind login or get a hard rate limit.

**Default if you say nothing: behind the login.** Safe, reversible, and I will confirm the cost
before suggesting otherwise.

---

## Order of work

Auth first. If the pages come first there is a window where the site is public and the app is not
locked, and that window is when the data is exposed.

1. **`users` + `sessions` tables** — migration in `src/lib/db.ts`, same style as the existing ones
2. **`src/lib/auth.ts`** — hash, verify, create session, read session. Pure functions, tested
3. **`/api/auth/login`, `/api/auth/logout`, `/api/auth/register`** — with both registration locks
4. **`src/middleware.ts`** — the allowlist gate
5. **Register once**, confirm `/register` then returns 403
6. **Confirm the app is actually locked** — hit `/api/projects` and `/dashboard` logged out. This
   is the step that proves the point of the whole exercise, so it is not optional
7. **`AppChrome`** — the third chrome mode
8. **`/login` page** — plain form
9. **Homepage, About, Contact** — content, and the `contact_messages` table
10. **Move `/` to the homepage** — currently it redirects to `/dashboard`; logged-in users should
    still land there, logged-out users see the homepage
11. **Session check inside the three paid routes**
12. **Test both states end to end** — logged out sees the public site and nothing else; logged in
    sees everything

Steps 1–6 are the real work. 7–10 are pages.

---

## Not in this plan, on purpose

| Not building | Why |
|---|---|
| Password reset by email | One user who knows the password. If lost: one SQL update. |
| Roles, permissions, teams, invites | One user. |
| OAuth / "sign in with Google" | Another dependency and another secret, for one login. |
| Email notifications | See the contact form section. Upgrade later if volume justifies it. |
| Blog, pricing page, testimonials | Not asked for. Say no until a real prospect asks. |
| Cookie banner | One functional session cookie, no tracking. Nothing to consent to. Add one only if analytics get added. |
| Multi-tenancy | The thing `BUILD-PLAN.md` warns about hardest. Still right to refuse. |

---

## Honest cost

Nothing per month. No new paid service, no new npm dependency — `node:crypto` and Postgres are
already here.

The real cost is that **deploying this makes the SSRF question real**, and that work is not in
this plan. Four routes fetch arbitrary URLs. Behind a login they are only reachable by you, which
is why the login is enough *for now* — but if `/audit` ever goes public, those routes need a URL
allowlist that blocks private address ranges before it does.

---

# What was actually built

Built and verified: **217 tests pass, `tsc` clean, `eslint` clean**, and the lock was tested
signed-out and signed-in through a live browser.

## Three decisions that changed during the build

### 1. No `/register` page at all

You said no registration first, and only sharing with chosen people. So the page was dropped
entirely and replaced with `npm run create-user`, which only runs on a machine that already
holds the database credentials.

That is **strictly safer than the two-lock plan above**. A door that does not exist cannot be
forced, rate-limited around, or forgotten about after first use. It also handles inviting people
— run it once per person.

```
npm run create-user -- --email you@example.com --name "Your Name"
```

It generates the password unless you pass one, warns when a second account is being made (there
are no roles — every account sees and spends what yours does), and refuses if the schema has not
been created yet.

### 2. `src/proxy.ts`, not `src/middleware.ts`

**Next.js 16 renamed the convention.** A `middleware.ts` would simply never have run — the app
would have looked protected and been wide open. Found by reading
`node_modules/next/dist/docs`, as `AGENTS.md` instructs, rather than trusting memory.

### 3. The proxy does a real database check

The Next docs advise keeping Proxy to "optimistic checks" and avoiding the database. That advice
assumes a *signed* cookie that can be verified without I/O. Ours is an opaque random token, so
there is nothing to verify offline — stopping at "a cookie is present" would let anyone who sets
64 arbitrary hex characters walk past, and then only routes that happen to re-check would stop
them. There are 50.

Two things make it affordable, and both were deliberate:

- **Anonymous traffic never touches the database.** No cookie, or a wrong-shaped one, is refused
  before any `await`. That is every prefetch, bot and drive-by.
- **A valid session is one indexed primary-key lookup.**

This was only possible because **Next 16 runs Proxy on the Node.js runtime by default** (Edge
before 15.5). On Edge, `pg` would not load and this design would have been impossible.

## What it looks like now, measured

| Route | Signed out | Signed in |
|---|---|---|
| `/`, `/about`, `/contact`, `/login` | 200 | 200 (`/` sends you to the dashboard) |
| `/dashboard`, `/messages`, `/settings`, `/audit` | **307 → /login** | 200 |
| `/api/projects`, `/api/suggest`, `/api/projects/x/grid` | **401** | 200 |

`/audit` went behind the login, the stated default. Still worth revisiting as a public lead
magnet once its per-run cost is known.

## Security properties that were tested, not assumed

- **A forged 64-hex cookie is rejected** — passes the shape check, fails the database check. This
  is the attack the design exists to stop.
- **Wrong password and unknown email return byte-identical wording.** Telling them apart hands an
  attacker a list of which addresses are worth attacking.
- **A missing user still runs a hash comparison** against a dummy value, so "unknown email" is
  not measurably faster than "wrong password".
- **`timingSafeEqual`, never `===`.** String comparison returns early on the first differing
  byte, which leaks how much of a hash was correct.
- **Mixed-case email logs in.** `EL@StorageMaterials.com` and `el@...` are one account.
- **Cookie is `httpOnly`**, so page scripts cannot read the session.
- **Honeypot silently discards bots.** A filled hidden field returns `{ok:true}` and stores
  nothing — a 400 would tell the bot's author the trap exists.
- **Session tokens come from `crypto.randomBytes`, not `generateId()`.** `generateId()` uses
  `Math.random()`; fine for a row id, forgeable as a session token, and a forged token is a full
  login. There is a test pinning this.

## Two real bugs found by testing the UI

**`router.refresh()` then `router.push()` does not navigate.** The refresh re-renders the current
route and the push is lost. On login that meant a *correct* password left you on the login page
with no error — which reads exactly like a wrong password. On sign-out it meant staying on the
page you had just signed out of, still showing data. Both now use `window.location.assign()`,
which is the right call regardless: the session cookie changes what every server component
renders, so a full reload is what guarantees a clean state.

**The `next=` parameter was an open redirect.** It comes from the proxy, so it is
attacker-controllable in a link; `?next=https://evil.example` would have turned the login page
into a redirect borrowing your domain's trust. Only same-site paths are accepted now.

## Not built, and why

Everything in the "Not in this plan" table above still stands. Also skipped:

- **Password reset.** No email service. Lost password means deleting the row and re-running the
  command.
- **Per-message read/unread buttons at `/messages`.** Opening the inbox marks it read. Busywork
  for an audience of one.
- **A captcha.** Honeypot plus a two-second timing check. A captcha is a stranger-trust feature
  that annoys real people.

## Still true, and still the real risk

Deploying makes the SSRF question live. Four routes fetch arbitrary URLs
(`/api/suggest`, `/api/evaluations/[id]/crawl`, `/api/evaluations/[id]/self`,
`/api/missions/[id]/tasks/[taskId]/verify`). All four are now behind the login, which is why this
is safe *for now* — the only person who can reach them is someone you gave an account to. **If
`/audit` is ever made public, those routes need a URL allowlist that blocks private address
ranges first.**
