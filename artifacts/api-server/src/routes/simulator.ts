import { Router, type IRouter } from "express";
import {
  GetSimulatorStatusResponse,
  ToggleSimulatorBody,
  ToggleSimulatorResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth.js";
import { isRunning, startSimulator, stopSimulator } from "../lib/simulator.js";

const router: IRouter = Router();

// GET /simulator/status
router.get("/simulator/status", requireAuth, (_req, res): void => {
  res.json(GetSimulatorStatusResponse.parse({ running: isRunning() }));
});

// POST /simulator/toggle
router.post("/simulator/toggle", requireAuth, async (req, res): Promise<void> => {
  const parsed = ToggleSimulatorBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  if (parsed.data.running) {
    await startSimulator();
  } else {
    stopSimulator();
  }

  res.json(ToggleSimulatorResponse.parse({ running: isRunning() }));
});

export default router;
