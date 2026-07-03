# Springboard Atlantic — Booth Kiosk

A single-page, no-build, no-backend visitor kiosk for trade show booths. Visitors:

1. Pick the problem area(s) they're trying to solve (defence-oriented categories) and optionally describe it in their own words.
2. Get matched capabilities pulled live from `Capability/data.csv` (research clusters, labs/programs, orgs, links).
3. Optionally leave name / email / organization / a specific request for follow-up.

Branding is pulled from `Banner.png`: dark navy (`#101c2c`) background with the Springboard Atlantic lime green (`#5fae00`) as the accent color.

## Running it locally

No install needed — it's plain HTML/CSS/JS.

- **Simplest:** double-click `index.html` to open it directly in a browser.
- **With a local server** (matches how it'll behave when hosted): `node server.js`, then open `http://localhost:5173`.

## Updating the capability data

The visitor-facing recommendations come from `data.js`, which is generated from `../Capability/data.csv`. Whenever that CSV changes:

```
node build-data.mjs
```

This re-parses the CSV (handles the multi-line quoted description cells) and rewrites `data.js`.

## Deploying for free (shareable URL / QR code)

**Netlify Drop** (fastest, no account strictly required):
1. Go to https://app.netlify.com/drop
2. Drag the whole `kiosk-app` folder onto the page.
3. You get a live `https://...netlify.app` URL instantly. Create a free account to keep it permanently and get a nicer subdomain.

**GitHub Pages** (if you'd rather host from a repo):
1. Create a new GitHub repo and push the contents of `kiosk-app/`.
2. Repo Settings → Pages → deploy from the `main` branch, `/root`.
3. Your URL will be `https://<username>.github.io/<repo>/`.

Once you have the URL, generate a QR code for booth signage with any free QR tool (e.g. `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=<your-url>` works directly in a browser/img tag — no account needed).

## Admin: exporting captured leads

Leads are stored in the browser's `localStorage` on whatever device the form was submitted from — **there is no server**, so leads never leave the device.

To open the admin panel:
- Tap/click the footer text ("Springboard Atlantic — Where Industry Meets Research") 5 times quickly, **or**
- Open the site with `?admin=1` in the URL, e.g. `https://yoursite.netlify.app/?admin=1`

From there you can **Download CSV** (opens/saves a `.csv` you can import into Excel) or **Clear all leads**.

> **Important:** because storage is per-device, only leads submitted *on that specific browser* show up in its admin panel. If you run the kiosk on one booth laptop/tablet, all leads collect there and exporting once a day is simple. If visitors instead scan a QR code to fill it out on **their own phones**, each submission stays trapped on that visitor's phone — you'd never see it. For reliable lead capture, run this on one or two booth-owned devices and export periodically; use the QR/link mainly for convenience (e.g. letting a visitor browse capabilities on their own phone while chatting with your staff), not as the primary submission channel.

## Kiosk behavior

- After ~45 seconds of inactivity mid-flow, an overlay invites the next visitor to tap to continue, then resets to the welcome screen.
- The welcome and thank-you screens auto-clear state so the kiosk is ready for the next visitor.
