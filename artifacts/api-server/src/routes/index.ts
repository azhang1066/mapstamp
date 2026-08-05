import { Router, type IRouter } from "express";
import healthRouter from "./health";
import mapDataRouter from "./map-data";
import photosRouter from "./photos";
import statsRouter from "./stats";

const router: IRouter = Router();

router.use(healthRouter);
router.use(mapDataRouter);
router.use(photosRouter);
router.use(statsRouter);

export default router;
