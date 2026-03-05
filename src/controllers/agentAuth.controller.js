import { pool } from "../config/database.js";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();

export const agentLogin = async (req, res) => {
    try {
        const { agent_id, api_key } = req.body;

        if (!agent_id || !api_key) {
            return res.status(400).json({
                success: false,
                error: "Agent ID and API Key are required"
            });
        }

        const [agents] = await pool.execute(
            `SELECT 
                a.id, 
                a.name, 
                a.contact_person,
                a.hostname,
                a.status,
                a.is_active,
                a.departement_id,
                d.name as department_name,
                d.company_id,
                c.name as company_name
            FROM agents a
            LEFT JOIN departement d ON a.departement_id = d.id
            LEFT JOIN company c ON d.company_id = c.id
            WHERE a.id = ? AND a.api_key = ? AND a.is_active = 1`,
            [agent_id, api_key]
        );

        if (agents.length === 0) {
            return res.status(401).json({
                success: false,
                error: "Invalid Agent ID or API Key"
            });
        }

        const agent = agents[0];

        const token = jwt.sign(
            { 
                id: agent.id,
                type: 'agent',
                name: agent.name,
                company_id: agent.company_id,
                department_id: agent.departement_id
            },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
        );

        await pool.execute(
            `INSERT INTO agent_connections 
             (agent_id, connection_type, ip_address, status) 
             VALUES (?, 'http', ?, 'success')`,
            [agent.id, req.ip || req.connection.remoteAddress]
        );

        res.json({
            success: true,
            message: "Login successful",
            token,
            agent: {
                id: agent.id,
                name: agent.name,
                company: agent.company_name,
                department: agent.department_name,
                hostname: agent.hostname,
                contact_person: agent.contact_person,
                status: agent.status
            }
        });

    } catch (error) {
        console.error("Agent login error:", error);
        res.status(500).json({
            success: false,
            error: "Internal server error"
        });
    }
};

export const getAgentProfile = async (req, res) => {
    try {
        const agentId = req.user.id; 

        const [agents] = await pool.execute(
            `SELECT 
                a.id,
                a.name,
                a.contact_person,
                a.hostname,
                a.ip_address,
                a.mac_address,
                a.platform,
                a.status,
                a.last_seen,
                a.registered_at,
                d.name as department_name,
                c.name as company_name,
                c.address as company_address,
                c.email as company_email,
                c.phone as company_phone,
                c.website as company_website,
                (SELECT COUNT(*) FROM agent_printers ap WHERE ap.agent_id = a.id) as printer_count
            FROM agents a
            LEFT JOIN departement d ON a.departement_id = d.id
            LEFT JOIN company c ON d.company_id = c.id
            WHERE a.id = ?`,
            [agentId]
        );

        if (agents.length === 0) {
            return res.status(404).json({
                success: false,
                error: "Agent not found"
            });
        }

        res.json({
            success: true,
            agent: agents[0]
        });

    } catch (error) {
        console.error("Get agent profile error:", error);
        res.status(500).json({
            success: false,
            error: "Internal server error"
        });
    }
};