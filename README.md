# FieldForce Live

FieldForce Live contains the operations API, the administrator dashboard, and
an Expo mobile app for field agents.

## Agent mobile app

The mobile app lives in `artifacts/fieldforce-mobile` and includes:

- field-agent sign-in;
- clock-in, idle/busy, and clock-out controls;
- today's published route as a map and ordered stop list;
- proximity alerts, navigation, calling, stop arrival, and disposition capture;
- foreground GPS reporting, SOS, profile and location-permission status; and
- durable offline delivery for location, shift, status, and visit updates.

The API runs on port `7070` by default. To start the API, admin dashboard, and
Expo together:

```sh
START_MOBILE=true pnpm start
```

For a physical phone, set the API origin to the development machine's LAN
address before starting Expo:

```sh
EXPO_PUBLIC_API_URL=http://192.168.1.50:7070 \
pnpm --filter @workspace/fieldforce-mobile dev:lan
```

Replace `192.168.1.50` with the machine's actual LAN address. The phone and
development machine must be on the same network. For a deployed build, set
`EXPO_PUBLIC_API_URL` to the public HTTPS API origin.

Other useful commands:

```sh
pnpm --filter @workspace/fieldforce-mobile dev:web
pnpm --filter @workspace/fieldforce-mobile android
pnpm --filter @workspace/fieldforce-mobile ios
pnpm --filter @workspace/fieldforce-mobile typecheck
```

For public server deployment, multi-device use, Expo QR testing, and Android/
iOS release builds, see [DEPLOYMENT.md](./DEPLOYMENT.md).
