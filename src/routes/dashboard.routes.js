import express from 'express';
import { connectionManager } from '../services/websocket/connection.manager.js';
import { AgentModel } from '../models/agent.model.js';
import { PrinterModel } from '../models/printer.model.js';
import { pool } from '../config/database.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { readFile } from 'fs/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = express.Router();

// GET /api/health
router.get("/health", (req, res) => {
  res.json({
    status: "ok",
    server: "Printer Dashboard Backend",
    version: "1.3.0",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    connections: connectionManager.getStats(),
    database: "connected",
    environment: process.env.NODE_ENV || 'development'
  });
});

// GET /api/websocket/status
router.get("/websocket/status", (req, res) => {
  res.json({
    success: true,
    agentConnections: {
      count: connectionManager.getStats().agents,
      connections: connectionManager.getAgentIds().map(id => ({ agentId: id }))
    },
    dashboardConnections: {
      count: connectionManager.getStats().dashboards
    },
    timestamp: new Date().toISOString()
  });
});

// GET /api/system/info
router.get("/system/info", async (req, res) => {
  try {
    const [dbStats] = await pool.execute(`
      SELECT 
        (SELECT COUNT(*) FROM agents) as total_agents,
        (SELECT COUNT(*) FROM agent_printers) as total_printers,
        (SELECT COUNT(*) FROM print_history WHERE DATE(printed_at) = CURDATE()) as prints_today,
        (SELECT SUM(pages) FROM print_history WHERE DATE(printed_at) = CURDATE()) as pages_today
    `);

    res.json({
      success: true,
      system: {
        nodeVersion: process.version,
        platform: process.platform,
        memoryUsage: process.memoryUsage(),
        uptime: process.uptime(),
        pid: process.pid
      },
      database: dbStats[0] || {},
      websocket: connectionManager.getStats(),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("Error getting system info:", error);
    res.status(500).json({ success: false, error: "Failed to get system information" });
  }
});

// POST /api/websocket/command/:agentId
router.post("/websocket/command/:agentId", async (req, res) => {
  try {
    const { agentId } = req.params;
    const { command, data } = req.body;

    if (!command) {
      return res.status(400).json({ success: false, error: "Command is required" });
    }

    const sent = connectionManager.sendToAgent(agentId, {
      type: "command",
      commandId: `cmd_${Date.now()}`,
      action: command,
      data: data || {},
      timestamp: new Date().toISOString()
    });

    if (sent) {
      res.json({
        success: true,
        message: "Command sent to agent",
        agentId,
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(404).json({ success: false, error: "Agent is not connected via WebSocket" });
    }
  } catch (error) {
    console.error("Error sending WebSocket command:", error);
    res.status(500).json({ success: false, error: "Failed to send command" });
  }
});

// GET /api/stats/agents
router.get("/stats/agents", async (req, res) => {
  try {
    const stats = await AgentModel.getStatistics();

    res.json({
      success: true,
      stats: {
        totalAgents: stats.total_agents || 0,
        onlineAgents: stats.online_agents || 0,
        offlineAgents: stats.offline_agents || 0,
        pendingAgents: stats.pending_agents || 0,
        agentsWithPrinters: stats.agents_with_printers || 0,
        totalPrinters: stats.total_printers || 0,
        activePrinters: stats.active_printers || 0,
        problemPrinters: stats.problem_printers || 0
      }
    });
  } catch (error) {
    console.error("Error getting agent statistics:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// GET /api/stats/prints
router.get("/stats/prints", async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const stats = await PrinterModel.getPrintStatistics(startDate, endDate);

    res.json({
      success: true,
      count: stats.length,
      stats: stats.map(stat => ({
        date: stat.print_date,
        totalPrints: stat.total_prints,
        totalPages: stat.total_pages,
        uniqueAgents: stat.unique_agents,
        uniquePrinters: stat.unique_printers
      }))
    });
  } catch (error) {
    console.error("Error getting print statistics:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// GET /api/printers/lifetime/:printerName
router.get("/printers/lifetime/:printerName", async (req, res) => {
  const { printerName } = req.params;
  const decodedName = decodeURIComponent(printerName);

  try {
    const [rows] = await pool.execute(`
      SELECT name, display_name, total_pages, color_pages_total, bw_pages_total,
             ink_levels, status, vendor, ip_address, updated_at
      FROM agent_printers 
      WHERE name LIKE ? OR display_name LIKE ?
      LIMIT 1
    `, [`%${decodedName}%`, `%${decodedName}%`]);

    if (rows.length === 0) {
      return res.json({
        success: true,
        printerName: decodedName,
        lifetimePages: 0,
        source: "not_found",
        timestamp: new Date().toISOString()
      });
    }

    const printer = rows[0];

    res.json({
      success: true,
      printerName: printer.display_name || printer.name,
      lifetimePages: printer.total_pages || 0,
      colorPagesTotal: printer.color_pages_total || 0,
      bwPagesTotal: printer.bw_pages_total || 0,
      inkLevels: printer.ink_levels ? JSON.parse(printer.ink_levels) : {},
      status: printer.status,
      vendor: printer.vendor,
      ipAddress: printer.ip_address,
      lastUpdated: printer.updated_at,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting lifetime pages:', error);
    res.status(500).json({ success: false, error: 'Failed to get lifetime pages' });
  }
});

// GET /api/daily-report (from pages.json)
router.get("/daily-report", async (req, res) => {
  try {
    const { date = new Date().toISOString().split('T')[0] } = req.query;

    const dataPath = path.join(__dirname, '../../data/pages.json');
    let pagesData = {};

    try {
      const rawData = await readFile(dataPath, 'utf8');
      pagesData = JSON.parse(rawData);
    } catch (error) {
      console.log("No pages data file found, using empty data");
    }

    let totalPages = 0;
    const byPrinter = [];

    for (const [printerName, printerData] of Object.entries(pagesData)) {
      if (printerData && typeof printerData === 'object') {
        const pages = printerData[date] || 0;
        if (pages > 0) {
          totalPages += pages;
          byPrinter.push({ printer: printerName, pages });
        }
      }
    }

    res.json({
      success: true,
      report: { date, totalPages, byPrinter },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("Error getting daily report:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;