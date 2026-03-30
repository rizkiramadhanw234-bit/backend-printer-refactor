import { WebSocketServer } from 'ws';
import { connectionManager } from './connection.manager.js';
import { AgentModel } from '../../models/agent.model.js';
import { PrinterModel } from '../../models/printer.model.js';
import { PrinterService } from '../printer.service.js';
import { WEBSOCKET_TYPES } from '../../config/constants.js';
import { logger } from '../../utils/logger.js';

const cleanToken = (token) => {
    if (!token) return null;
    const cleaned = token.replace(/^(Bearer|bearer)\s+/i, '').trim();
    return cleaned || null;
};

export class AgentWebSocket {
    constructor() {
        this.port = process.env.AGENT_WS_PORT || 15001;
        this.path = '/ws/agent';

        this.wss = new WebSocketServer({
            port: this.port,
            host: '0.0.0.0',
            path: this.path
        });

        this.printerService = new PrinterService();
        this.setup();

    }

    setup() {
        this.wss.on('connection', this.handleConnection.bind(this));
    }

    normalizePrinterName(name) {
        if (!name || typeof name !== "string") return name || "";
        const cleaned = name.replace(/^\[\d{2}:\d{2}:\d{2}\]\s*/i, "").trim();
        return cleaned;
    }

    async handleConnection(ws, req) {
        const clientIp = req.socket.remoteAddress;
        console.log(`New agent connection attempt from ${clientIp}`);

        let token = '';
        const authHeader = req.headers['authorization'] || '';
        if (authHeader) {
            token = cleanToken(authHeader);
            console.log(`🔑 Token from headers (clean): ${token ? token.substring(0, 16) + '...' : 'empty'}`);
        }

        if (!token) {
            const url = new URL(req.url, `http://${req.headers.host}`);
            token = cleanToken(url.searchParams.get('token') || '');
            if (token) console.log(`🔑 Token from query param: ${token.substring(0, 16)}...`);
        }

        if (!token) {
            logger.error('No authentication token provided');
            ws.close(1008, 'Authentication token required');
            return;
        }

        console.log(`Final token: ${token.substring(0, 16)}...`);

        let authenticated = false;
        let agentId = null;

        const authTimeout = setTimeout(() => {
            if (!authenticated) {
                logger.error(`Authentication timeout for ${clientIp}`);
                ws.close(1008, 'Authentication timeout');
            }
        }, 10000);

        ws.once('message', async (data) => {
            try {
                const message = JSON.parse(data.toString());
                console.log(`Initial message type: ${message.type}`);

                const validTypes = ['device_register', 'registration', 'register', 'agent_register'];

                if (validTypes.includes(message.type)) {

                    agentId = message.data?.agentId ||
                        message.data?.agent_id ||
                        message.agentId ||
                        message.agent_id;

                    if (!agentId) {
                        logger.error('No agentId in message');
                        ws.close(1008, 'Missing agentId');
                        return;
                    }

                    console.log(`Agent ID from message: ${agentId}`);

                    let agent = await AgentModel.findById(agentId);

                    if (agent) {
                        console.log(`Updating token for agent ${agentId}`);

                        await AgentModel.update(agentId, {
                            agent_token: token,
                            status: 'online'
                        });

                        agent = await AgentModel.findById(agentId);

                        authenticated = true;
                        clearTimeout(authTimeout);

                        await this.onAuthenticated(ws, agent, clientIp, req);

                    } else {
                        logger.error(`Agent ${agentId} not found in database`);
                        ws.close(1008, 'Agent not found');
                    }
                } else {
                    logger.error(`Expected registration message, got ${message.type}`);
                    ws.close(1008, 'Invalid first message');
                }
            } catch (error) {
                logger.error('Error processing initial message:', error);
                ws.close(1008, 'Authentication failed');
            }
        });

        ws.on('close', () => {
            clearTimeout(authTimeout);
            if (agentId && !authenticated) {
                logger.warn(`WebSocket closed before authentication for ${agentId}`);
            }
        });
    }

    async onAuthenticated(ws, agent, clientIp, req) {
        const agentId = agent.id;
        console.log(`✅ Agent authenticated: ${agentId} (${agent.name})`);

        connectionManager.addAgent(agentId, ws);

        await AgentModel.saveConnection(agentId, {
            ip: clientIp,
            userAgent: req.headers['user-agent']
        });

        ws.send(JSON.stringify({
            type: WEBSOCKET_TYPES.AGENT.CONNECTION_ACK,
            status: 'connected',
            agentId,
            timestamp: new Date().toISOString()
        }));

        ws.removeAllListeners('message');

        ws.on('message', async (data) => {
            try {
                const message = JSON.parse(data.toString());
                console.log(`📨 Message from ${agentId}: ${message.type}`);
                await this.handleMessage(agentId, ws, message);
            } catch (error) {
                console.log(`Error processing message from ${agentId}:`, error);
            }
        });

        // Handle close
        ws.on('close', async () => {
            console.log(`🔌 Agent WebSocket disconnected: ${agentId}`);

            connectionManager.removeAgent(agentId);
            await AgentModel.updateStatus(agentId, 'offline');
            await AgentModel.closeConnection(agentId);

            try {
                const printers = await PrinterModel.findByAgent(agentId);
                for (const printer of printers) {
                    await PrinterModel.update(agentId, printer.name, {
                        status: 'offline',
                        printerStatusDetail: 'offline'
                    });
                }
                console.log(`🖨️ Marked ${printers.length} printers offline for agent ${agentId}`);

                // Broadcast printer offline ke dashboard
                connectionManager.broadcastToDashboards({
                    type: WEBSOCKET_TYPES.DASHBOARD.PRINTER_UPDATE,
                    agentId,
                    printers: printers.map(p => ({
                        ...p,
                        status: 'offline',
                        printerStatusDetail: 'offline'
                    })),
                    timestamp: new Date().toISOString()
                });

            } catch (err) {
                console.error(`❌ Failed to mark printers offline:`, err);
            }

            connectionManager.broadcastToDashboards({
                type: WEBSOCKET_TYPES.DASHBOARD.AGENT_DISCONNECTED,
                agentId,
                timestamp: new Date().toISOString()
            });
        });

        // Handle error
        ws.on('error', (error) => {
            console.log(`WebSocket error for ${agentId}:`, error);
            AgentModel.updateStatus(agentId, 'error');
        });

        connectionManager.broadcastToDashboards({
            type: WEBSOCKET_TYPES.DASHBOARD.AGENT_CONNECTED,
            agentId,
            data: {
                name: agent.name,
                hostname: agent.hostname,
                platform: agent.platform,
                ip: clientIp
            },
            timestamp: new Date().toISOString()
        });
    }

    async handleMessage(agentId, ws, message) {
        switch (message.type) {
            case WEBSOCKET_TYPES.AGENT.REGISTER:
                break;

            case WEBSOCKET_TYPES.AGENT.PRINTER_UPDATE:
            case WEBSOCKET_TYPES.AGENT.PRINTER_STATUS:
                await this.handlePrinterUpdate(agentId, message.data);
                break;

            case WEBSOCKET_TYPES.AGENT.INK_STATUS:
                await this.handleInkStatus(agentId, message.data);
                break;

            case WEBSOCKET_TYPES.AGENT.PRINT_EVENT:
                await this.handlePrintEvent(agentId, message.data);
                break;

            case WEBSOCKET_TYPES.AGENT.DAILY_REPORT:
                await this.handleDailyReport(agentId, message.data);
                break;

            case WEBSOCKET_TYPES.AGENT.HEARTBEAT:
                await this.handleHeartbeat(agentId);
                ws.send(JSON.stringify({
                    type: 'heartbeat_ack',
                    timestamp: new Date().toISOString()
                }));
                break;

            default:
                console.log(`Unknown message type from ${agentId}: ${message.type}`);
        }
    }

    async handlePrinterUpdate(agentId, data) {
        const printers = data.printers || data;
        console.log(`Received ${printers.length} printers from ${agentId}`);

        for (const printer of printers) {
            const normalizedName = this.normalizePrinterName(printer.name);
            const printerCopy = { ...printer, name: normalizedName };

            const processed = await this.printerService.processPrinterUpdate(agentId, printerCopy);

            delete processed.pages_today;
            delete processed.color_pages_today;
            delete processed.bw_pages_today;

            await PrinterModel.upsert(agentId, processed);
        }

        connectionManager.broadcastToDashboards({
            type: WEBSOCKET_TYPES.DASHBOARD.PRINTER_UPDATE,
            agentId,
            printers,
            timestamp: new Date().toISOString()
        });
    }

    async handleInkStatus(agentId, data) {
        const inkStatus = data.inkStatus || data;
        console.log(`Received ink status from ${agentId}`);

        for (const [printerName, inkData] of Object.entries(inkStatus)) {
            const normalizedName = this.normalizePrinterName(printerName);

            if (inkData.levels) {
                const lowInkColors = [];
                Object.entries(inkData.levels).forEach(([color, level]) => {
                    if (level < 15) lowInkColors.push(color);
                });

                await PrinterModel.update(agentId, normalizedName, {
                    inkLevels: inkData.levels,
                    lowInkColors,
                    totalPages: inkData.totalPages || 0
                });
            }
        }

        connectionManager.broadcastToDashboards({
            type: WEBSOCKET_TYPES.DASHBOARD.INK_UPDATE,
            agentId,
            data: inkStatus,
            timestamp: new Date().toISOString()
        });
    }

    async handlePrintEvent(agentId, data) {
        try {
            let { printerName, pages, isColor } = data;
            const normalizedName = printerName.replace(/^\[[^\]]*\]\s*/, '').trim();

            console.log(`🖨️ Print event: ${agentId} - ${normalizedName} - ${pages} pages (${isColor ? 'COLOR' : 'B&W'})`);

            await PrinterModel.savePrintEvent(agentId, normalizedName, pages, isColor || false);

            console.log(`✅ Print event saved`);
        } catch (error) {
            console.log(`❌ Failed to save print event:`, error);
        }
    }

    async handleDailyReport(agentId, data) {
        console.log(`Daily report from ${agentId}: ${data.totalPages} pages`);
    }

    async handleHeartbeat(agentId) {
        await AgentModel.updateStatus(agentId, 'online');
    }
}