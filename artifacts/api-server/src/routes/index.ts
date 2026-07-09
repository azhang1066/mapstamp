import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import mapDataRouter from "./map-data";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(mapDataRouter);

export default router;
