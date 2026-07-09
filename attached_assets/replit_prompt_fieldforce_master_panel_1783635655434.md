# Replit Build Prompt — "FieldForce Live" Master / Admin Panel

> Paste everything below into the Replit Agent. It describes a single deliverable: the **web-based Master (Admin) Panel** for an enterprise field-force tracking platform. The mobile user app and the separate customer panel are **out of scope for this build** but their integration points are defined so nothing has to be re-architected later.

---

## 1. Objective

Build a production-quality, responsive **web admin panel** that lets an enterprise track its field workforce in real time on a Google Map. Field employees carry company SIMs (data + voice) and run a mobile app (built separately) that streams their GPS location with their **explicit consent**. This panel visualizes that live data, stores 30 days of history, computes movement analytics, and lets an admin push an emergency "call back now" alert to any employee.

**The headline feature:** a live map showing the real-time position and movement of **all** active users simultaneously, with per-user drill-down.

---

## 2. Scope of this build

**In scope (build this):**
- Web Admin Panel (desktop-first, responsive) — the "Master Panel".
- Backend API + database powering it.
- A **location-ingestion REST endpoint** the mobile app will call (define and implement it).
- A **location simulator** (seed users + a background job that emits realistic GPS pings) so the live map works end-to-end for the demo without the mobile app existing yet.
- Admin authentication (username + password + email OTP).
- User creation + "send onboarding link" action (WhatsApp/email link generation — stub the actual send behind an interface).

**Out of scope (do NOT build, but leave clean seams):**
- The mobile user app (Android/iOS/Huawei) — it only needs the ingestion endpoint contract.
- The separate customer panel — model the `customer` (tenant) entity but build only the admin experience.
- Real WhatsApp Business API / FCM / APNs sending — abstract behind a `NotificationService` interface with a console-logging default implementation.

---

## 3. Tech stack

**The backend MUST be written in Go.** Do not use Node/Express for the backend.

- **Backend:** **Go** with the **Gin** web framework. Structure it as a clean, modular service (handlers → services → repository layers) so it can later be split into microservices without rewrites.
- **ORM / DB access:** **GORM** for models and migrations (acceptable alternative: `sqlc` + `pgx` if you prefer generated, type-safe queries — pick one and be consistent).
- **Realtime:** WebSocket in Go using **`gorilla/websocket`** (or `coder/websocket`) to push live location updates to the map. Client falls back to 5-second HTTP polling if the socket drops.
- **Database:** PostgreSQL (Replit built-in).
- **Cache / pub-sub (optional but preferred):** Redis for fan-out of live pings to connected WebSocket clients and for OTP / rate-limit storage.
- **Auth:** JWT sessions (`golang-jwt`) + **bcrypt** password hashing (`golang.org/x/crypto/bcrypt`) + time-boxed email OTP.
- **Config:** environment variables via Replit Secrets (use `envconfig` or `viper`).
- **Frontend:** React + TypeScript + Vite, TailwindCSS for styling, TanStack Query for data fetching. (Frontend and Go backend run as two processes; proxy `/api` and `/ws` from the frontend dev server to the Go server.)
- **Maps (frontend):** Google Maps JavaScript API via `@vis.gl/react-google-maps` (or `@react-google-maps/api`).

Organize the Go project idiomatically (e.g. `/cmd/server`, `/internal/handlers`, `/internal/service`, `/internal/repo`, `/internal/models`, `/internal/ws`). Keep the DB schema and REST/WebSocket contract stable so the platform can grow into additional Go microservices later.

---

## 4. Google Maps APIs to integrate

Enable and use:
- **Maps JavaScript API** — render the live map, markers, polylines, info windows.
- **Directions API** — shortest route + ETA from a user's current position to a visit stop / assigned workplace; also powers the sequencing of a day's multi-stop route and the **public customer tracking link** (§10).
- **Distance Matrix API** — distance + travel time from current position to the 5 pre-marked places, to the day's visit stops, and for the live customer link (batch efficient).
- **Geocoding API** — convert the office/home/site addresses entered at user creation into lat/long, resolve visit-stop inputs (address strings, Google Maps pin URLs, or raw "lat,lng") into coordinates, and reverse-geocode ping coordinates into readable addresses.
- **Places API (optional)** — address autocomplete when entering the 5 pre-marked locations.

Read the Google Maps API key from a Replit **Secret** named `GOOGLE_MAPS_API_KEY` (never hard-code it). The browser key and server key should be separable (`GOOGLE_MAPS_BROWSER_KEY`, `GOOGLE_MAPS_SERVER_KEY`).

---

## 5. Data model

Design these entities (add sensible indexes on `userId`, `recordedAt`):

- **Customer (Tenant):** id, name, status. Every user/admin belongs to a customer.
- **User:** id, customerId, firstName, lastName, gender, employeeCode (unique per customer), phoneNumber (E.164), email, role (`ADMIN` | `USER`), status (`INVITED` | `ACTIVE` | `SUSPENDED`), consentGivenAt (nullable), createdAt.
- **UserAddresses:** userId, type (`OFFICE` | `BASE_OFFICE` | `SITE_OFFICE` | `HOME`), rawAddress, latitude, longitude. (Support the 4 named addresses; the "5 pre-marked places" for proximity = Office, Home, Site1, Site2, Site3 — model these as **MarkedPlace** rows so up to 5 are configurable per user.)
- **MarkedPlace:** id, userId, label (e.g. "Office","Home","Site 1"), latitude, longitude.
- **Credential:** userId, passwordHash (admins only).
- **OtpToken:** userId, codeHash, expiresAt, consumedAt.
- **Session (Login/Logout event):** id, userId, loginAt, loginLat, loginLng, logoutAt, logoutLat, logoutLng.
- **LocationPing:** id, userId, latitude, longitude, speedKph (nullable — see §8c), accuracyM, recordedAt, batteryLevel (nullable). This is the high-volume table; keep it lean and indexed on (userId, recordedAt).
- **VisitStop:** id, userId, customerId, visitDate, sequence (final routed order within the day), **priority (`P1` | `P2` | `P3`)**, customerCode (**alphanumeric name that denotes the customer to be visited**, e.g. `ACME-014`, `DLF-07`), label (optional human name), inputType (`ADDRESS` | `PIN` | `LATLNG`), rawInput (the address string, Google Maps pin URL, or "lat,lng" the admin pasted), latitude, longitude (resolved), status (`PENDING` | `EN_ROUTE` | `REACHED` | `COMPLETED` | `SKIPPED`), plannedArrivalAt (nullable), actualArrivalAt (nullable), createdByAdminId. Each user has an ordered **list** of VisitStops per day (their day's route). The "assigned workplace" for §8f = the user's current/next `PENDING`/`EN_ROUTE` VisitStop.
- **DayPlan (published route):** id, userId, visitDate, status (`DRAFT` | `PUBLISHED`), publishedAt, publishedByAdminId, totalDistanceMeters, totalEtaSeconds — represents the finalized, priority-ordered route pushed to the user's app. VisitStops belong to a DayPlan.
- **PublicTrackLink:** id, visitStopId, token (unguessable, URL-safe), createdByAdminId, createdAt, expiresAt (default end of `visitDate`), revokedAt (nullable), lastViewedAt. Powers the shareable customer link (see §10). One link is scoped to exactly one user → one stop.
- **DwellSegment (derived):** userId, latitude, longitude, placeLabel (nullable), enteredAt, exitedAt, durationSeconds — computed by clustering consecutive pings (see §8g/h).
- **EmergencyAlert:** id, userId, triggeredByAdminId, message, triggeredAt, acknowledgedAt.
- **OnboardingInvite:** userId, token, channel (`WHATSAPP` | `EMAIL`), deepLink, createdAt, usedAt.

---

## 6. Authentication & roles

- **Admin login (web):** username/email + password → server sends a 6-digit **OTP to the admin's email** → admin enters OTP → issue JWT. OTP valid 10 minutes, single use, rate-limited.
- **Role guard:** only `ADMIN` can access the panel. `USER` accounts never log into the web panel — they only exist to be tracked via the mobile app.
- Store an audit log of admin logins (time + IP).

---

## 7. User creation & onboarding flow

Admin fills a **Create User** form with: firstName, lastName, gender, employeeCode, phoneNumber, email, and four addresses (office, base office, site office, home) + up to 5 marked places, and role (`USER`/`ADMIN`).

On save:
1. Geocode each address to lat/long (Geocoding API) and store.
2. If **ADMIN** → generate credentials; the person can log into the web panel with username + password + email OTP.
3. If **USER** → generate an **OnboardingInvite** with a deep link and produce a shareable link intended for **WhatsApp** (and email fallback). The link should route the user to download the app from the **correct store based on device** — Apple App Store (iOS), Google Play (Android), Huawei AppGallery (Huawei/HarmonyOS). Implement this as a smart landing page: `/onboard/:token` that reads the User-Agent and shows the right store button; include manual buttons for all three stores as fallback.
4. The onboarding page must present a **consent screen**: the user must explicitly agree to location tracking before the app is considered active. Record `consentGivenAt` when consent is captured (the mobile app will call a `POST /api/onboarding/:token/consent` endpoint — implement it; the landing page can also simulate it for the demo).

Abstract the actual WhatsApp/email dispatch behind `NotificationService.sendOnboardingLink(user, link)` with a console-logging stub. Show the generated link in the UI with a "Copy" button so it's demoable.

---

## 8. Master Panel features

Build a left-nav dashboard. **Landing view = the Live Map** (§9). Then per-user detail views exposing every metric below.

**(a) Login / Logout times** — table + timeline of session start/end per user, filterable by date.

**(b) Login / Logout locations** — plot login and logout points on the Google Map with markers; show Latitude/Longitude numerically in the info window and in the table.

**(c) Speed** — Google does not provide a person's speed directly. **Compute it** from consecutive `LocationPing`s: `speedKph = haversineDistance(p1,p2) / (t2 - t1)`. Store on ingestion and display current speed + a speed sparkline over the last hour. Flag implausible spikes (GPS jitter) with a smoothing window.

**(d) 30-day history of login/logout + movement** — per user, a day-by-day view; selecting a day replays that day's movement as a **polyline (breadcrumb trail)** on the map with a time scrubber.

**(e) Proximity to 5 pre-marked places** — for the selected user's current position, show live distance (and travel time via Distance Matrix) to each of their up-to-5 MarkedPlaces (Office, Home, Site1, Site2, Site3), sorted nearest-first, with a "currently at X" badge when within a configurable radius (default 100 m).

**(f) Proximity / route to assigned workplace** — for the user's current/next `VisitStop`, show distance, **ETA**, and the **shortest route** drawn on the map (Directions API). Include remaining distance and estimated arrival time.

**(g) Time-at-current-location** — if the user has been stationary within a radius (default 75 m) beyond a threshold (default 5 min), show "At [place/coords] for HH:MM". Implement dwell detection by clustering consecutive pings.

**(h) 30-day places-visited calendar** — a calendar-style view where each day lists the distinct places visited (derived `DwellSegment`s), with the label/address (reverse-geocoded) and total dwell time at each. Clicking a day shows it on the map.

**(i) Emergency alert** — an "Alert" button on each user (and on the live map marker) that triggers `EmergencyAlert` and dispatches a "Call back immediately" command to the user's device via `NotificationService.sendEmergencyAlert(user, message)` (stub → console + record row). Show alert status (sent / acknowledged) in the UI.

**(j) Daily visit list (day route)** — admin can assign each user an ordered **list of stops to visit that day**. Each stop is entered as an **address, a Google Maps pin/URL, or raw lat-long**, and is tagged with an **alphanumeric customer code** (e.g. `ACME-014`) that names the customer being visited. Show the day's stops as a numbered list + as pins/route on the map, with per-stop status (Pending / En route / Reached / Completed). Full detail in §10.

**(k) Shareable customer tracking link** — for any stop, the admin can **copy a public link** and send it to that customer. Opening the link shows the customer a live map with the field user's current position, the customer's own location, the route between them, and the **live distance + ETA** of the user reaching them. Full detail in §10.

---

## 9. Live tracking (headline feature)

- Default dashboard = a full-bleed Google Map showing **every ACTIVE user** as a live marker with initials/employee code and a status color (moving = green, stationary = amber, no-signal/stale >5 min = grey).
- Markers update in real time via WebSocket as new pings arrive; animate marker movement between pings.
- Left sidebar = searchable/filterable user list; clicking a user pans/zooms to them and opens their detail drawer (all §8 metrics).
- Cluster markers when zoomed out (marker clustering) for large fleets.
- Top bar: live count of active/stationary/offline users, date filter, customer/tenant selector.

---

## 10. Daily visit itinerary & public customer tracking link

Two connected features.

### 10.1 Assigning a user's daily visits (admin side)

- On a user's detail page, add a **"Day plan"** panel where the admin builds an ordered **list of visit stops** for a chosen date.
- For each stop the admin can enter the location in any of three ways: a typed **address**, a pasted **Google Maps pin / share URL**, or raw **`lat,lng`**. Resolve all three to coordinates (Geocoding API for addresses; parse the pin URL or the raw pair for the others). Show the resolved point on a mini-map for confirmation.
- Each stop is tagged with an **alphanumeric customer code** (e.g. `ACME-014`, `DLF-07`) that denotes the customer, plus an optional friendly label.
- Each stop is assigned a **priority: `P1`, `P2`, or `P3`** (P1 = highest / must-visit-first). Show priority as a colored chip (P1 red, P2 amber, P3 grey) and let the admin change it inline.
- **Priority-driven route planning.** When the admin clicks **"Plan route"**, the system computes the day's order as follows: stops are grouped into priority bands and the bands are always sequenced **P1 → P2 → P3**; *within* each band the order is optimized for shortest travel (Directions API waypoint optimization / nearest-neighbour from the previous stop), chained from the user's start point (base office or current location). The result is a single ordered route: all P1 stops (optimally ordered) first, then all P2, then all P3. Persist the resulting `sequence` on each VisitStop and the route totals on the `DayPlan`. Draw the full route as a polyline with per-leg distance/ETA and cumulative planned arrival times.
- **Push route to the user.** A **"Push to user"** (Publish) button finalizes the `DayPlan` (status → `PUBLISHED`) and sends the ordered, priority-planned route to the user's mobile app via `NotificationService.pushDayPlan(user, dayPlan)` (stubbed → console + record). The app fetches its plan from `GET /api/user/dayplan?date=YYYY-MM-DD` (auth via device token), which returns the ordered stops with sequence, priority, customerCode, coordinates, and per-leg ETAs. Re-publishing after edits pushes an updated plan.
- Each stop row shows live status (Pending / En route / Reached / Completed), auto-updated: when the user's live position enters the stop radius (default 100 m) mark it Reached and stamp `actualArrivalAt`.
- Each stop row has a **"Copy customer link"** button (see 10.2) and a "Send via WhatsApp/email" action (stubbed through `NotificationService`).

### 10.2 Public customer tracking link (customer side)

- Clicking **"Copy customer link"** generates (or reuses) a `PublicTrackLink` with an unguessable token and copies a URL like `https://<app>/track/:token` to the clipboard.
- The link is **public — no login required** — and resolves to a lightweight, mobile-friendly tracking page (no admin chrome). It renders a Google Map showing:
  - the **field user's live position** (updating in real time via the same WebSocket/polling feed, scoped to just this one user),
  - the **customer's stop location** (the VisitStop point),
  - the **route between them** (Directions API), and
  - a prominent banner with **live distance + ETA** ("Arriving in ~12 min · 4.3 km away"), refreshed as the user moves.
- Show only what a customer should see: the agent's **first name** (or a generic "Your field executive"), live position, distance, and ETA. **Do NOT expose** phone number, employee code, movement history, other stops, or any other user's data.
- Implement a public read endpoint, e.g. `GET /api/public/track/:token` → returns `{ agentFirstName, agentLat, agentLng, destLat, destLng, distanceMeters, etaSeconds, status, updatedAt }`, computing distance/ETA server-side (Distance Matrix/Directions) with short-TTL caching to control Maps cost. Serve the live position over a public, token-scoped WebSocket/polling channel.
- **Privacy & lifecycle:** the token **expires** automatically (default end of the stop's `visitDate`) and once the stop is `COMPLETED`; the admin can **revoke** it manually. After expiry/revoke the page shows a neutral "This tracking link has expired" message. Rate-limit the public endpoint. Since sharing a worker's live location with an external customer is a fresh disclosure beyond the employee's tracking consent, keep the shared data minimal and time-boxed by design.

---

## 11. Location ingestion API (contract for the mobile app)

Implement and document:
- `POST /api/ingest/location` — auth via a per-user device token. Body: `{ userId, latitude, longitude, accuracyM, batteryLevel, recordedAt }`. Server computes `speedKph` vs the previous ping, stores the `LocationPing`, updates dwell state, and broadcasts over WebSocket.
- `POST /api/ingest/session` — `{ userId, event: "LOGIN"|"LOGOUT", latitude, longitude, at }`.
- `POST /api/onboarding/:token/consent` — records `consentGivenAt`, flips user to ACTIVE.
- `GET /api/user/dayplan?date=YYYY-MM-DD` — auth via device token; returns the user's **published, priority-ordered day route** (ordered stops with sequence, priority, customerCode, coordinates, per-leg ETAs). This is what the "Push to user" action publishes.
- Accept **batched** pings (array) for offline catch-up.

---

## 12. Location simulator (so the demo is live now)

Include a togglable background simulator implemented as a **Go goroutine** (started/stopped via an admin toggle and a `SIMULATOR_ENABLED` config flag) that:
- Seeds one customer, 2 admins, and ~15 field users with realistic Indian metro coordinates (default: New Delhi NCR; make the city configurable).
- Emits pings every 5–10 s per user along plausible road-like paths (some moving, some dwelling at a marked place), routing them through `POST /api/ingest/location` so the exact same path the real app will use is exercised.
- Randomly triggers a couple of dwell periods so §8g/h have data.
- Seeds a few **VisitStops** per user for the current day and drives some users along a path toward their next stop, so the day plan (§10.1) and the public customer link (§10.2) show a live, shrinking distance/ETA in the demo.
- Can be started/stopped from an admin "Demo Mode" toggle.

---

## 13. UI / UX

- Clean, dense, enterprise dashboard aesthetic. Sidebar nav, top status bar, map-centric layout.
- Data tables with sort/filter/date-range; CSV export on history tables.
- Use a professional palette (deep indigo primary, coral accent for alerts/emergency); clear status chips.
- Mobile-responsive but desktop-optimized.
- Every timestamp shown in the customer's timezone (default Asia/Kolkata, configurable).

---

## 14. Security & config

- All Google keys, DB URL, JWT secret, OTP mailer creds in **Replit Secrets**.
- Restrict the browser Maps key by HTTP referrer; the server key by API + IP.
- Hash passwords (bcrypt) and OTP codes; rate-limit auth and ingestion endpoints.
- Multi-tenant isolation: every query scoped by `customerId`; an admin only ever sees their own customer's users.
- **Public track links** carry unguessable tokens, expire and can be revoked, are rate-limited, and expose only the minimal fields in §10.2 — never full history, contact details, or other stops/users.
- Log location access (which admin viewed whom, and public-link views) for compliance/audit, since this is consent-based personal tracking.

---

## 15. Deliverables & acceptance criteria

Done means:
1. Admin can log in with password + email OTP.
2. Admin can create a USER and an ADMIN; USER creation produces a copyable WhatsApp/email onboarding link whose landing page detects device and shows the right store + a consent screen.
3. The live map shows all simulated users moving in real time, with correct status colors and marker clustering.
4. Selecting a user exposes every metric a–k: login/logout times + locations (lat/long on map), computed speed, 30-day movement replay, proximity to the 5 marked places, route+ETA to current visit stop, time-at-current-location, 30-day calendar of visited places with dwell times, the daily visit list, and the shareable customer link.
5. The emergency alert button records and "dispatches" an alert (stubbed) and reflects status in the UI.
6. Admin can build a user's **daily visit list** from addresses / Google pins / lat-long, each tagged with an alphanumeric customer code and a **P1/P2/P3 priority**; clicking "Plan route" orders the day **P1 → P2 → P3** (shortest-path optimized within each band); "Push to user" publishes the ordered route and the app can fetch it via `GET /api/user/dayplan`.
7. Admin can **copy a public customer link** for any stop; opening it (no login) shows a live map with the user's position, the customer's location, the route, and live **distance + ETA** — with only minimal customer-safe data, and the link expires/revokes correctly.
8. The ingestion API + the public track endpoint are implemented and documented; the simulator drives the whole thing through them.
9. Secrets are used for all keys; multi-tenant scoping enforced.
10. The **backend is Go (Gin)**, builds cleanly (`go build ./...`), runs migrations on startup, and serves both the REST API and the WebSocket endpoint.

Provide a short README covering setup, the two-process run model (Go server + Vite frontend), required Secrets, `go run`/build commands, the ingestion API contract, and how to toggle Demo Mode.
