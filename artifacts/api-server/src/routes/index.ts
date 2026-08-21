import { Router, type IRouter } from "express";
import healthRouter from "./health";
import mapDataRouter from "./map-data";
import photosRouter from "./photos";
import statsRouter from "./stats";
import profileRouter from "./profile";
import usersRouter from "./users";
import connectionsRouter from "./connections";
import compareRouter from "./compare";
import leaderboardRouter from "./leaderboard";
import sharesRouter from "./shares";

const router: IRouter = Router();

router.use(healthRouter);
router.use(mapDataRouter);
router.use(photosRouter);
router.use(statsRouter);
router.use(profileRouter);
router.use(usersRouter);
router.use(connectionsRouter);
router.use(compareRouter);
router.use(leaderboardRouter);
router.use(sharesRouter);

export default router;
