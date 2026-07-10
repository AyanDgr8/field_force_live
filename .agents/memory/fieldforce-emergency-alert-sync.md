---
name: FieldForce emergencyActive/alert sync
description: Rule for keeping users.emergencyActive consistent with emergency_alerts rows across all trigger/acknowledge paths.
---

`users.emergencyActive` is a denormalized flag the live map/alerts UI filters on. It must be updated on every code path that creates or acknowledges an `emergency_alerts` row, in both directions (`ADMIN_TO_USER` and `USER_TO_ADMIN`):
- Setting it true only on the USER_TO_ADMIN (panic) path but not on ADMIN_TO_USER (admin-triggered callback) made admin-initiated alerts invisible in the alerts panel, since that panel filters positions by `emergencyActive`.
- Acknowledging only the single most-recent open alert (instead of all open alerts, or checking for remaining ones before clearing the flag) left stale `emergencyActive=true` state or cleared it while other alerts were still open.

**Why:** the flag and the alerts table are two separate sources of truth with no DB constraint tying them together; any new mutation path must explicitly re-derive/update both.

**How to apply:** before adding a new way to create or acknowledge an emergency alert, check both (a) does it set `emergencyActive` true on creation, and (b) does its acknowledge path check whether any other unacknowledged alerts remain for that user before clearing the flag.
