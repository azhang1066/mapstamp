import { Router, type IRouter } from "express";
import healthRouter from "./health";
import mapDataRouter from "./map-data";
import photosRouter from "./photos";

const router: IRouter = Router();

router.use(healthRouter);
router.use(mapDataRouter);
router.use(photosRouter);

export default router;
