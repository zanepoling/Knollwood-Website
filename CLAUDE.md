# Knollwood Website — Operating Guide (read this first)

This file is the briefing for anyone — person or AI assistant — maintaining the
Knollwood website. If you are an AI assistant working in this folder, read this
whole file before making any change.

Knollwood is a restored 1851 antebellum mansion at 150 Major Reynolds Pl,
Knoxville, TN 37919, owned by Mollenhour Gross. This repo is its website plus a
private reservation/guest-management system.

---

## 1. How edits reach the live site (the golden rules)

- This is a **static site** — plain HTML/CSS/JS. There is no build step. You edit
  files in this folder; that's it.
- **Publishing:** the owner commits and pushes with **GitHub Desktop**. After a
  push, GitHub Pages redeploys in about a minute.
- **DO NOT `git pull` before pushing.** Pulling has re-added the `CNAME` file and
  caused merge races that clobbered un-pushed work. Let the human push through
  GitHub Desktop. An assistant should edit files and hand them off — not run git.
- **Never inline images as base64** inside the HTML. That is what made pages
  multiple megabytes and painfully slow. Put images in `images/…` (or
  `reserve/img/…`), reference them by path, and lazy-load where possible. Keeping
  pages light is a hard requirement.

## 2. Where it lives

- **Repo:** `github.com/zanepoling/Knollwood-Website`
- **Hosting:** GitHub Pages (`.nojekyll` is present to skip Jekyll processing).
- **Live domain:** `knollwood.mollenhourgross.com` (set by the `CNAME` file; DNS
  points the subdomain at GitHub Pages).

## 3. Pages in this repo

| Path | Public? | What it is |
|------|---------|------------|
| `index.html` | Public | The homepage. A single-file app with hash routing (`#/gallery-rooms`, `#/craftsmen`, etc.). Galleries open a fullscreen lightbox with a small caption. |
| `reserve/index.html` | **Private** (`noindex`, not linked anywhere) | The reservation flow: enter access code → agree to Terms → booking form (area, date, time, guests). Dates before the opening date are blacked out. Area photos live in `reserve/img/`. |
| `guests/index.html` | **Private** | The guest-list page. A host logs in with their access code, sees their saved guests as editable rows, can add/edit/remove, and saves. |
| `approve/index.html` | **Private** | The team review page. Opened from the Approve/Deny buttons in the booking-notification email; records the decision in the Bookings sheet. |
| `kw-codes-k9x7h2q4m8/index.html` | **Private** | The internal access-code generator. Its long, unguessable URL **is** the security — treat that URL as a staff secret. Bookmark it (works on phones). |

`images/` holds the photos (`main`, `rooms`, `views`, `gardens`, `features`,
`historical`, `people`, `embedded`). The `Claude outputs/` folder is old scratch
files and backend copies — not used by the site (see Security).

## 4. The reservation backend (Google Apps Script)

The four private pages talk to a **Google Apps Script web app**, not a normal
server. Key facts:

- The script is **container-bound** to the Google Sheet **"Knollwood -
  Reservations."** Open the Sheet → Extensions → Apps Script to edit it.
- Pages call it via **JSONP** (a `callback` parameter) because Apps Script blocks
  reading cross-origin POSTs. The endpoint is the script's `/exec` URL, hardcoded
  as `ENDPOINT` near the top of each private page's script.
- Deployment settings: **Execute as:** the deploying owner; **Who has access:**
  Anyone. (This is why it can write to the Sheet for anonymous visitors.)
- **CRITICAL DEPLOY GOTCHA:** editing the script does **not** update the live
  `/exec` URL. To push script changes live you must:
  **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy.**
  (Same URL, new code. If you only Save, visitors still run the old code.)
- **Time-based triggers run the latest *saved* code, not the deployed version.**
  So a change that only affects a trigger (e.g. keep-warm) needs Save + re-run,
  not a redeploy.
- Actions the script handles: `ping` (warm-up), `verify` (check a code),
  `booking` (log a reservation + email the team), `gencode` (make an access
  code), `lookup`/`decide` (approve/deny), `attendee`/`guestlist`/`savelist`
  (guest-list read/write).
- A reference copy of the script is at `Claude outputs/Knollwood-Reserve-Backend.gs`,
  but **the Apps Script editor is the source of truth** — always read the live
  script before changing it.

### Cold starts / why it can feel slow
Apps Script spins the backend down when idle, so the first request after a quiet
spell can take 15–20 seconds ("cold start"). Mitigations already in place:

- `installKeepWarm()` creates a time trigger that pings the live web app **every
  minute**, keeping it hot. If the pages ever get slow again, open the Apps Script
  **⏰ Triggers** tab and confirm `keepWarm` is there running every minute; if not,
  run `installKeepWarm()` again (approve the one-time permission prompt).
- The pages also pre-warm the backend on page load.
- A **warm** response is ~1–3 seconds — that's Apps Script's floor. Truly instant
  would require moving the data off Apps Script (a bigger project).

## 5. The Google Sheet ("Knollwood - Reservations")

Three tabs. Column reads in the script are **header-aware** (matched by header
name, with fallbacks), so adding columns is safe — but don't rename the key
headers.

- **Access Codes** — `Code, Issued To (legacy), Issued, Expires, Notes, First
  Name, Last Name, Company, Mobile Phone, Contact Email, Authorized By`. Codes
  expire 30 days after they're issued.
- **Bookings** — `Timestamp, First, Last, Name, Email, Phone, Organization, Area,
  Preferred Date, Start, End, Guests, Notes, Terms Accepted, Terms Accepted At,
  Code, Booking ID, Status, Decided At, Hosting Entity, Authorizing Person
  Comments`.
- **Attendees** — `Timestamp, Access Code, First Name, Last Name`. One row per
  expected guest, tied to the host's access code.

## 6. How it runs day to day

1. **Issue a code:** open the generator page (the `kw-codes-…` URL), fill in the
   guest's name/company/email/phone, pick who's authorizing it, hit Generate, and
   share the code with the guest. It's logged to the Access Codes tab.
2. **Guest requests a booking:** at `/reserve/` they enter the code, agree to
   Terms, pick area/date/time, and submit. The team gets an email with Approve /
   Deny buttons. The guest gets **one** acknowledgment email and nothing else
   automated.
3. **Approve or deny:** click the button in that email → confirm on the approve
   page → it records Approved/Denied in Bookings. **Follow up with the guest
   personally** — approve/deny sends them no email by design.
4. **Guest list before an event:** the host goes to `/guests/`, enters their code,
   and adds/edits/removes names, then Saves. They can return anytime with the same
   code to update it.

## 7. Design system (keep new work consistent)

- Colors as CSS `:root` tokens: `--ink #0a0908`, `--ivory #f2ece0`,
  `--brass #d3ac68`, `--line rgba(200,163,102,0.22)`.
- Fonts: serif **"ltc-kennerley"** (Adobe Fonts / Typekit kit `sdm7mjw`) with
  **"Sorts Mill Goudy"** (Google Fonts) as the fallback. Loaded non-render-blocking
  so text paints immediately.
- Every private page carries `<meta name="robots" content="noindex, nofollow">`.
  Keep that on any new private page.

## 8. Common edits — where to look

- **Homepage copy / sections:** `index.html`.
- **Gallery contents:** the `ROOMS`, `GARDENS`, `GFEATURES`, `GVIEWS` arrays in
  `index.html` (each item has `name`, `sub`, `img`).
- **Craftsmen wall:** the `CRAFTSMEN` and `LEADERS` arrays in `index.html`.
- **Reservation open date (blackout):** the `OPENDATE` constant in
  `reserve/index.html`.
- **Bookable areas:** the `AREAS` array in `reserve/index.html`; their photos in
  `reserve/img/`.

## 9. Accounts the maintainer needs

- The **GitHub repo** `zanepoling/Knollwood-Website` (to push) — plus GitHub
  Desktop installed and signed in.
- The **Google account** that owns the "Knollwood - Reservations" Sheet and its
  Apps Script (to manage codes/bookings and deploy script changes).
- The **domain DNS** for `knollwood.mollenhourgross.com` (rarely touched; only if
  hosting moves).

## 10. Security notes (worth cleaning up)

- The repo is the public website — **anything committed here is public.** The
  code-generator's key and the approval secret live in client/script code, so the
  generator's real protection is its unguessable URL. Keep that URL to staff only.
- `Claude outputs/` contains old copies of the backend script committed into the
  repo, which means the backend source is publicly browsable. Consider removing
  that folder and rotating the keys/secret in the Apps Script.
