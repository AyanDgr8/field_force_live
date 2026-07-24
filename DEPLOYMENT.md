# FieldForce production deployment

The system has three separate parts:

1. the API server;
2. the admin website; and
3. the Expo/React Native agent app.

Deploying the API and admin website does **not** automatically create an APK,
an App Store app, or a permanent mobile QR code.

## 1. Required public setup

Use a public domain with HTTPS. A typical layout is:

- `https://fieldforce.example.com` — admin website
- `https://fieldforce.example.com/api/*` — reverse-proxied to the API on port
  `7070`

The API already listens on `0.0.0.0`, so a reverse proxy such as Nginx can
reach it. Do not expose MySQL or the API's internal port directly to the
internet.

Create `.env` from `.env.example` and set at least:

```dotenv
MYSQL_HOST=127.0.0.1
MYSQL_USER=fieldforce
MYSQL_PASSWORD=use-a-long-random-password
MYSQL_DATABASE=fieldforce
SESSION_SECRET=use-a-different-long-random-secret

APP_URL=https://fieldforce.example.com
CORS_ORIGIN=https://fieldforce.example.com
EXPO_PUBLIC_API_URL=https://fieldforce.example.com
USE_HTTPS=false
```

Keep `USE_HTTPS=false` when Nginx/your cloud load balancer terminates HTTPS.
Set `USE_HTTPS=true` only when Node itself owns the TLS certificate.

The value of `EXPO_PUBLIC_API_URL` is embedded when the mobile app is built.
It must be the public HTTPS origin, never `localhost` or a private/LAN IP.

## 2. Build and run the server

On the server:

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm run build
```

Run the API as a supervised process (systemd, PM2, or the hosting platform)
with `PORT=7070`, `NODE_ENV=production`, and the variables from `.env`.

Serve `artifacts/fieldforce-admin/dist/public` as static files. Configure the
web server to:

- fall back to `index.html` for admin routes;
- proxy `/api/` to `http://127.0.0.1:7070/api/`;
- forward `X-Forwarded-Proto` and `Host`;
- use a valid TLS certificate; and
- allow WebSocket/long-lived HTTP requests if those are added later.

Verify:

```sh
curl https://fieldforce.example.com/api/healthz
```

Also open the admin website from a different network (for example, a phone on
mobile data) before distributing the app.

## 3. Test on phones with an Expo QR

An Expo development QR is temporary. It works only while the Expo development
server/tunnel is running:

```sh
cd artifacts/fieldforce-mobile
EXPO_PUBLIC_API_URL=https://fieldforce.example.com pnpm run dev:tunnel
```

Install Expo Go on each test phone and scan the QR printed by Expo. Because the
API URL is public HTTPS and the Expo connection is tunneled, the phone and
server do not need to share a Wi-Fi network.

Do not use this Expo QR as the production distribution method.

## 4. Create the Android app

Install/login to the Expo EAS CLI, then configure the project:

```sh
cd artifacts/fieldforce-mobile
pnpm dlx eas-cli login
pnpm dlx eas-cli build:configure
```

Before every release build, export the production API URL:

```sh
EXPO_PUBLIC_API_URL=https://fieldforce.example.com \
pnpm dlx eas-cli build --platform android --profile preview
```

Choose an APK in the generated EAS configuration for direct/internal
installation. EAS returns a download URL; create or display a QR code for that
URL so Android users can download the APK. For Google Play, build a production
AAB instead:

```sh
EXPO_PUBLIC_API_URL=https://fieldforce.example.com \
pnpm dlx eas-cli build --platform android --profile production
```

Upload the AAB to Google Play Console, preferably starting with Internal
Testing.

## 5. Create the iPhone app

An Apple Developer account is required:

```sh
EXPO_PUBLIC_API_URL=https://fieldforce.example.com \
pnpm dlx eas-cli build --platform ios --profile production
```

Distribute through TestFlight/App Store. iPhones generally cannot install an
arbitrary production IPA from a public QR code.

## 6. Multiple devices and admin visibility

All phones call the same public API and write to the same MySQL database, so
many agents can be online simultaneously and the admin dashboard can see them.
Create a separate field-user account for each agent; do not share one login
between employees, or their sessions and locations will be combined.

## 7. Production-readiness blockers

Do not expose this application to real employee traffic until these are
completed:

- enforce the mobile JWT on every `/api/ingest/*`, `/api/user/*`, and mobile
  configuration endpoint, and derive the user/customer identity from that JWT
  instead of trusting a `userId` or `customerId` sent by the phone;
- add rate limiting to login, OTP, password-reset, and ingestion endpoints;
- remove OTP values from application logs;
- implement token revocation/logout and a device/session management screen;
- add background-location tasks if tracking must continue while minimized;
- store push tokens and connect a real push-notification provider if alerts
  must reach a backgrounded app; and
- have the privacy, retention, consent, and employee-monitoring rules reviewed
  for every place where the app will be used.

The current mobile JWT is issued and stored, but several mobile API routes
still trust caller-supplied identity fields. That is suitable for a controlled
MVP test, not an internet-facing production launch.

For reliable operation:

- run exactly one shared production database with automated backups;
- use a process supervisor and automatic restart;
- keep server time synchronized and store timestamps consistently;
- enable HTTPS only and firewall MySQL;
- set real SMTP credentials for password reset/OTP email;
- monitor disk, database connections, API errors, and `/api/health`;
- test location permissions and battery optimization on both Android and iOS;
- publish a privacy policy and obtain employee consent for location tracking;
- test offline use and later synchronization before rollout; and
- load-test with at least the expected number of simultaneously active phones.

The mobile app currently sends foreground GPS updates and has an offline queue.
If tracking must continue reliably while the app is minimized or the screen is
locked, background-location tasks and the related Android/iOS permissions must
be implemented and tested before calling the system production-ready.
