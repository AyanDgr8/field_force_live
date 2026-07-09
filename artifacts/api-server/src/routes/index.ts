import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import usersRouter from "./users/index";
import liveRouter from "./live";
import historyRouter from "./history";
import dayplanRouter from "./dayplan";
import publicRouter from "./public";
import onboardingRouter from "./onboarding";
import ingestRouter from "./ingest";
import simulatorRouter from "./simulator";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(usersRouter);
router.use(liveRouter);
router.use(historyRouter);
router.use(dayplanRouter);
router.use(publicRouter);
router.use(onboardingRouter);
router.use(ingestRouter);
router.use(simulatorRouter);

export default router;
