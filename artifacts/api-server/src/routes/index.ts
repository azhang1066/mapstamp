import { Router, type IRouter } from "express";
import healthRouter from "./health";
import mapDataRouter from "./map-data";

const router: IRouter = Router();

router.use(healthRouter);
router.use(mapDataRouter);

export default router;
