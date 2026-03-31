import express from 'express';
import cors from 'cors';
import http from 'http';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import cron from 'node-cron';


import { testConnection, pool } from './src/config/database.js';
import { connectionManager } from './src/services/websocket/connection.manager.js';
import { AgentWebSocket } from './src/services/websocket/agent.ws.js';
import { DashboardWebSocket } from './src/services/websocket/dashboard.ws.js';

// Routes
import authRoutes from './src/routes/auth.routes.js';
import agentRoutes from './src/routes/agent.routes.js';
import agentAuthRoutes from './src/routes/agentAuth.routes.js';
import printerRoutes from './src/routes/printer.routes.js';
import companyRoutes from './src/routes/company.routes.js';
import departementRoutes from './src/routes/departement.routes.js';
import dashboardRoutes from './src/routes/dashboard.routes.js';
import reportsRoutes from './src/routes/reports.routes.js';

// Reset all printers/agents to offline on startup
import { PrinterModel } from './src/models/printer.model.js';
import { AgentModel } from './src/models/agent.model.js';

dotenv.config();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const server = http.createServer(app);

// Middleware
app.use(cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') ||
        ['http://localhost:15003', 'http://localhost:15004', 'https://www.mpsnewton.com', 'https://mpsnewton.com', 'https://client.mpsnewton.com']
}));
app.use(express.json());

// Test database connection
await testConnection();

try {
    const agents = await AgentModel.getAll();
    for (const agent of agents) {
        await AgentModel.updateStatus(agent.id, 'offline');
        const printers = await PrinterModel.findByAgent(agent.id);
        for (const printer of printers) {
            await PrinterModel.update(agent.id, printer.name, {
                status: 'offline',
                printerStatusDetail: 'offline'
            });
        }
    }
    console.log(`Reset ${agents.length} agents and their printers to offline`);
} catch (err) {
    console.error('Startup reset failed:', err.message);
}

// Initialize WebSocket servers
new AgentWebSocket();
new DashboardWebSocket(server);

// Routes 
app.use('/api/auth', authRoutes);
app.use('/api/agents', agentRoutes);
app.use('/api/agents', agentAuthRoutes);
app.use('/api/printers', printerRoutes);
app.use('/api/company', companyRoutes);
app.use('/api/departement', departementRoutes);
app.use('/api', dashboardRoutes);
app.use('/api/reports', reportsRoutes);

app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({
        success: false,
        error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error',
        timestamp: new Date().toISOString()
    });
});

cron.schedule('0 0 * * *', async () => {
    console.log('🔄 Resetting pages_today for all printers...');
    try {
        await pool.execute(`
            UPDATE agent_printers 
            SET pages_today = 0,
                color_pages_today = 0,
                bw_pages_today = 0
        `);
        console.log('pages_today reset successfully');
    } catch (error) {
        console.error('Failed to reset pages_today:', error.message);
    }
}, {
    timezone: "Asia/Jakarta"
});

const PORT = process.env.PORT || 15000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`HTTP Server: http://localhost:${PORT}`);
    console.log(`Agent WebSocket: ws://localhost:${process.env.AGENT_WS_PORT || 15001}/ws/agent`);
    console.log(`Dashboard WebSocket: ws://localhost:${process.env.DASHBOARD_WS_PORT || 15002}/ws/dashboard`);
});

export default app;