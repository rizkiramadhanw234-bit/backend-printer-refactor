import { WebSocketServer } from 'ws';
import { connectionManager } from './connection.manager.js';
import { AgentModel } from '../../models/agent.model.js';
import { PrinterModel } from '../../models/printer.model.js';
import { WEBSOCKET_TYPES } from '../../config/constants.js';
import { logger } from '../../utils/logger.js';
import { transformAgentForFrontend, transformPrinterForFrontend } from '../../utils/helpers.js';

export class DashboardWebSocket {
    constructor(server) {
        this.port = process.env.DASHBOARD_WS_PORT || 15002;
        this.path = '/ws/dashboard';

        this.wss = new WebSocketServer({
            port: this.port,  
            host: '0.0.0.0',
            path: this.path
        });

        this.setup();
    }

    setup() {
        this.wss.on('connection', this.handleConnection.bind(this));
    }

    async handleConnection(ws, req) {
        console.log('New dashboard WebSocket connection');

        // Optional: validate API key
        const url = new URL(req.url, `http://${req.headers.host}`);
        const apiKey = url.searchParams.get('api_key');

        connectionManager.addDashboard(ws);

        // Send initial data
        await this.sendInitialData(ws);

        ws.on('message', (data) => {
            try {
                const message = JSON.parse(data.toString());
                this.handleMessage(ws, message);
            } catch (error) {
                logger.error('Error processing dashboard message:', error);
            }
        });

        ws.on('close', () => {
            console.log('Dashboard disconnected');
            connectionManager.removeDashboard(ws);
        });

        ws.on('error', (error) => {
            logger.error('Dashboard WebSocket error:', error);
        });
    }

    handleMessage(ws, message) {
        switch (message.type) {
            case WEBSOCKET_TYPES.DASHBOARD.PING:
                ws.send(JSON.stringify({
                    type: WEBSOCKET_TYPES.DASHBOARD.PONG,
                    timestamp: new Date().toISOString()
                }));
                break;
            default:
                logger.warn(`Unknown message type from dashboard: ${message.type}`);
        }
    }

    async sendInitialData(ws) {
        try {
            const agents = await AgentModel.getAll();
            const formattedAgents = [];

            for (const agent of agents) {
                const printers = await PrinterModel.findByAgent(agent.id);
                formattedAgents.push({
                    id: agent.id,
                    name: agent.name,
                    company: agent.company_name,
                    department: agent.department_name,
                    status: agent.status,
                    lastSeen: agent.last_seen,
                    registeredAt: agent.registered_at,
                    printerCount: printers.length,
                    hostname: agent.hostname,
                    platform: agent.platform,
                    isOnline: agent.status === 'online'
                });
            }

            const stats = await AgentModel.getStatistics();

            ws.send(JSON.stringify({
                type: WEBSOCKET_TYPES.DASHBOARD.INITIAL_DATA,
                data: {
                    agents: formattedAgents,
                    statistics: stats,
                    timestamp: new Date().toISOString()
                }
            }));

            console.log(`Sent initial data to dashboard (${formattedAgents.length} agents)`);
        } catch (error) {
            console.log('Error sending initial data to dashboard:', error);
        }
    }
}