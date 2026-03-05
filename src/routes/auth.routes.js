import { Router } from "express";
import { authController } from "../controllers/auth.controller.js";
import { authMiddleware } from "../middleware/auth.middleware.js";

const router = Router();

router.post("/login", authController.login);
router.post("/logout", authMiddleware, authController.logout);
router.get("/check", authMiddleware, authController.check);


export default router;
