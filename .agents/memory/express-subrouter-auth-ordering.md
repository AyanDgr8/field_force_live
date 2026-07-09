---
name: Express sub-router mount-order footgun
description: A blanket auth middleware inside one sub-router can silently block unrelated public sub-routers mounted after it in the same parent router.
---

When several Express `Router()` instances are each mounted at the same path (e.g. `router.use(usersRouter); router.use(publicRouter); ...` all at `/`), a bare `router.use(requireAuth)` placed at the top of one of those sub-routers runs for **every** request that reaches that sub-router, not just its own routes — because the sub-router itself is mounted with no path scoping (matches everything).

If `requireAuth` sends a response (401/403) without calling `next()`, it doesn't just protect its own routes — it terminates the whole middleware chain for that request, so any router mounted *after* it in the parent (even a completely unrelated public router) never gets a chance to match and 401s instead of behaving correctly (e.g. 404 for an unknown public token).

**Why:** discovered when public, no-auth routes (`/onboarding/:token`, `/public/track/:token`) returned 401 instead of 404 because an admin-only router mounted earlier in the same parent had `router.use(requireAuth)` as a blanket layer.

**How to apply:** when multiple flat sub-routers share one mount point, apply auth middleware per-route (`router.get("/path", requireAuth, handler)`) instead of as a router-level `.use()`, so it only executes for that router's own matched paths and never intercepts unrelated routers' requests.
