import { Router, type IRouter } from "express";
import { z } from "zod";
import { requireAuth } from "../middlewares/auth.js";
import { searchPlaces, reverseGeocode, type ViewportBias } from "../lib/geo.js";

const router: IRouter = Router();

const searchQuery = z.object({
  q: z.string().min(2).max(200),
  // Optional map viewport, sent by the picker so results are biased towards
  // what the admin is currently looking at.
  swLat: z.coerce.number().min(-90).max(90).optional(),
  swLng: z.coerce.number().min(-180).max(180).optional(),
  neLat: z.coerce.number().min(-90).max(90).optional(),
  neLng: z.coerce.number().min(-180).max(180).optional(),
});
const reverseQuery = z.object({
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
});

// GET /geo/search?q=... -- free-text place lookup for the location pickers
router.get("/geo/search", requireAuth, async (req, res): Promise<void> => {
  const parsed = searchQuery.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { q, swLat, swLng, neLat, neLng } = parsed.data;
  const bias: ViewportBias | undefined =
    swLat != null && swLng != null && neLat != null && neLng != null
      ? { swLat, swLng, neLat, neLng }
      : undefined;

  try {
    res.json({ results: await searchPlaces(q, 6, bias) });
  } catch (error) {
    req.log.warn({ err: error }, "Place search failed");
    res.status(502).json({ error: "Place search is unavailable right now" });
  }
});

// GET /geo/reverse?latitude=&longitude= -- coordinate to postal address
router.get("/geo/reverse", requireAuth, async (req, res): Promise<void> => {
  const parsed = reverseQuery.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  try {
    res.json({ address: await reverseGeocode(parsed.data.latitude, parsed.data.longitude) });
  } catch (error) {
    req.log.warn({ err: error }, "Reverse geocoding failed");
    res.status(502).json({ error: "Address lookup is unavailable right now" });
  }
});

export default router;
