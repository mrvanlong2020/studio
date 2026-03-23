import { Router, type IRouter } from "express";
import healthRouter from "./health";
import customersRouter from "./customers";
import bookingsRouter from "./bookings";
import dressesRouter from "./dresses";
import rentalsRouter from "./rentals";
import paymentsRouter from "./payments";
import dashboardRouter from "./dashboard";

const router: IRouter = Router();

router.use(healthRouter);
router.use(customersRouter);
router.use(bookingsRouter);
router.use(dressesRouter);
router.use(rentalsRouter);
router.use(paymentsRouter);
router.use(dashboardRouter);

export default router;
