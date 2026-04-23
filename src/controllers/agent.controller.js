import { pool } from '../config/database.js';
import { AgentModel } from '../models/agent.model.js';
import { PrinterModel } from '../models/printer.model.js';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

const cleanToken = (token) => {
    if (!token) return null;
    if (token.startsWith('Bearer ')) {
        return token.substring(7).trim();
    }
    return token.trim();
};

export const registerAgent = async (req, res) => {
    const agentWsPort = process.env.AGENT_WS_PORT || 15001;
    const websocketUrl = process.env.WEBSOCKET_URL || `ws://localhost:${agentWsPort}/ws/agent`;
    try {
        const {
            hostname,
            macAddress,
            company,
            department,
            departmentId,
            location,
            contactPerson,
            phone,
            customAgentId,
            platform = 'windows',
            apiKey,
            agentToken
        } = req.body;

        if (!hostname || !macAddress || !contactPerson) {
            return res.status(400).json({
                success: false,
                error: 'hostname, macAddress, dan contactPerson wajib diisi'
            });
        }

        // Process department
        let finalDepartmentId = 1;
        if (departmentId) {
            finalDepartmentId = departmentId;
        }

        // Check MAC address
        const [macAddressCheck] = await pool.execute(
            'SELECT id, mac_address FROM agents WHERE mac_address = ?',
            [macAddress]
        );

        let finalAgentId;
        let finalApiKey;
        let finalAgentToken;
        let isNewAgent = false;

        const requestToken = cleanToken(agentToken);

        if (macAddressCheck && macAddressCheck.length > 0) {
            finalAgentId = macAddressCheck[0].id;
            console.log(`Agent dengan MAC ${macAddress} sudah ada, pakai ID: ${finalAgentId}`);

            finalApiKey = apiKey;
            finalAgentToken = requestToken || crypto.randomBytes(48).toString('hex');

            await AgentModel.update(finalAgentId, {
                status: 'online',
                hostname,
                api_key: finalApiKey,
                agent_token: finalAgentToken,
                platform,
                departement_id: finalDepartmentId,
                ip_address: req.ip || 'unknown',
                contact_person: contactPerson
            });
        } else {
            isNewAgent = true;
            finalAgentId = customAgentId || `AGENT_${uuidv4().substring(0, 8).toUpperCase()}`;
            finalApiKey = apiKey || crypto.randomBytes(32).toString('hex');
            finalAgentToken = requestToken || crypto.randomBytes(48).toString('hex');

            await AgentModel.create({
                id: finalAgentId,
                departement_id: finalDepartmentId,
                name: hostname,
                contact_person: contactPerson,
                hostname,
                ip_address: req.ip || 'unknown',
                mac_address: macAddress,
                platform,
                api_key: finalApiKey,
                agent_token: finalAgentToken
            });
        }

        res.json({
            success: true,
            agentId: finalAgentId,
            agentToken: finalAgentToken,
            apiKey: finalApiKey,
            websocketUrl: websocketUrl,
            message: isNewAgent ? 'Agent registered successfully' : 'Agent re-registered successfully',
            data: {
                hostname,
                platform,
                ip: req.ip || 'unknown',
                registeredAt: new Date().toISOString(),
                departmentId: finalDepartmentId
            }
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to register agent',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

export const handleAgentHeartbeat = async (req, res) => {
    try {
        const { agentId } = req.params;
        const {
            cpu_usage,
            memory_usage,
            printer_count,
            active_printers,
            last_print_minutes,
            system_info
        } = req.body;

        if (!agentId) {
            return res.status(400).json({ success: false, error: 'agentId is required' });
        }

        await AgentModel.updateStatus(agentId, 'online');

        if (cpu_usage || memory_usage) {
            await AgentModel.saveHeartbeat(agentId, {
                cpuUsage: cpu_usage,
                memoryUsage: memory_usage,
                printerCount: printer_count,
                activePrinters: active_printers,
                lastPrintMinutes: last_print_minutes
            });
        }

        res.json({
            success: true,
            message: 'Heartbeat received',
            timestamp: new Date().toISOString(),
            agentId
        });
    } catch (error) {
        console.error('Heartbeat error:', error);
        res.status(500).json({ success: false, error: 'Failed to process heartbeat' });
    }
};

export const syncPrinters = async (req, res) => {
    try {
        const { agentId } = req.params;
        const { printers = [] } = req.body;

        console.log(`Syncing ${printers.length} printers for agent ${agentId}`);

        if (printers.length === 0) {
            return res.json({ success: true, message: 'No printers to sync' });
        }

        for (const printer of printers) {
            let ipAddress = printer.ipAddress || printer.ip_address || null;

            await PrinterModel.upsert(agentId, {
                name: printer.name,
                display_name: printer.displayName || printer.name,
                ip_address: ipAddress || '0.0.0.0',
                status: printer.status || 'unknown',
                ink_levels: printer.inkStatus?.levels || printer.inkLevels || {},
                pages_today: printer.pagesToday || printer.todayPages || 0,
                total_pages: printer.totalPages || 0,
                last_print_time: printer.lastPrintTime || null,
                vendor: printer.vendor || 'Unknown',
                is_network: printer.isNetwork ? 1 : 0
            });
        }

        res.json({ success: true, message: 'Printers synced' });
    } catch (error) {
        console.error('Error syncing printers:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

export const initializeAgent = async (agentId, agentToken) => {
    try {
        console.log(`Initializing agent ${agentId}`);

        const cleanRequestToken = cleanToken(agentToken);

        if (!cleanRequestToken) {
            return { success: false, error: 'Invalid token format' };
        }

        const agent = await AgentModel.findByToken(cleanRequestToken);

        if (!agent) {
            return { success: false, error: 'Agent not found' };
        }

        if (agent.id !== agentId) {
            return { success: false, error: 'Token mismatch' };
        }

        await AgentModel.updateStatus(agentId, 'online');

        return {
            success: true,
            agent,
            message: 'Agent connected successfully'
        };
    } catch (error) {
        console.error('Error in initializeAgent:', error);
        return { success: false, error: error.message };
    }
};

export const getAgentConfig = async (agentId) => {
    try {
        const agent = await AgentModel.findById(agentId);
        if (!agent) return null;

        const agentWsPort = process.env.AGENT_WS_PORT || 15001;
        const apiPort = process.env.PORT || 15000;
        const host = process.env.HOST || 'localhost';
        const protocol = process.env.NODE_ENV === 'production' ? 'wss' : 'ws';
        const httpProtocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';

        return {
            agentId: agent.id,
            name: agent.name,
            hostname: agent.hostname,
            platform: agent.platform,
            company: agent.company_name,
            department: agent.department_name,
            contactPerson: agent.contact_person,
            config: {
                pollingInterval: 30000,
                printerCheckInterval: 60000,
                heartbeatInterval: 15000,
                maxRetries: 3,
                timeout: 10000
            },
            serverInfo: {
                websocketUrl: `${protocol}://${host}:${agentWsPort}/ws/agent`,
                apiBaseUrl: `${httpProtocol}://${host}:${apiPort}/api`
            }
        };
    } catch (error) {
        console.error('Get agent config error:', error);
        return null;
    }
};

export const handleAgentConnection = async (agentId, connectionInfo) => {
    try {
        await AgentModel.saveConnection(agentId, connectionInfo);
        return true;
    } catch (error) {
        console.error(`Error handling agent connection for ${agentId}:`, error);
        return false;
    }
};

export const handleAgentDisconnection = async (agentId) => {
    try {
        await AgentModel.closeConnection(agentId);
        return true;
    } catch (error) {
        console.error(`Error handling agent disconnection for ${agentId}:`, error);
        return false;
    }
};