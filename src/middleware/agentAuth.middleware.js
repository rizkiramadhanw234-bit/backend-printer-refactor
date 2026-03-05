import jwt from "jsonwebtoken";
import { pool } from "../config/database.js";

export const verifyAgentToken = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];

        if (!token) {
            return res.status(401).json({
                success: false,
                error: "No token provided"
            });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        if (decoded.type !== 'agent') {
            return res.status(403).json({
                success: false,
                error: "Invalid token type"
            });
        }

        const [agents] = await pool.execute(
            "SELECT id, status FROM agents WHERE id = ? AND is_active = 1",
            [decoded.id]
        );

        if (agents.length === 0) {
            return res.status(401).json({
                success: false,
                error: "Agent not found or inactive"
            });
        }

        req.user = decoded;
        next();

    } catch (error) {
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({
                success: false,
                error: "Invalid token"
            });
        }
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                error: "Token expired"
            });
        }
        console.error("Auth middleware error:", error);
        res.status(500).json({
            success: false,
            error: "Internal server error"
        });
    }
};