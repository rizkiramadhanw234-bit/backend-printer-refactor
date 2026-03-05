import express from "express";
import { agentLogin, getAgentProfile } from "../controllers/agentAuth.controller.js";
import { verifyAgentToken } from "../middleware/agentAuth.middleware.js";

const router = express.Router();

router.post("/agent-login", agentLogin);
router.get("/agent/profile", verifyAgentToken, getAgentProfile);

export default router;