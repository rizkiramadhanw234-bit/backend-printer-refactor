import express from 'express';
import { authMiddleware } from '../middleware/auth.middleware.js';
import {
  registerAgent,
  handleAgentHeartbeat,
  syncPrinters
} from '../controllers/agent.controller.js';
import { AgentModel } from '../models/agent.model.js';
import { PrinterModel } from '../models/printer.model.js';
import { connectionManager } from '../services/websocket/connection.manager.js';

const router = express.Router();

const authenticateAgent = async (req, res, next) => {
  try {
    const { agentId } = req.params;
    const authHeader = req.headers['authorization'];

    if (!authHeader) {
      return res.status(401).json({ success: false, error: "Authorization header required" });
    }

    let token = authHeader;
    if (authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }

    if (!token) {
      return res.status(401).json({ success: false, error: "Agent token required" });
    }

    const agent = await AgentModel.findByToken(token);

    if (!agent || agent.id !== agentId) {
      return res.status(401).json({ success: false, error: "Invalid agent ID or token" });
    }

    if (agent.status === 'pending') {
      return res.status(403).json({ success: false, error: "Agent registration is pending approval" });
    }

    req.agent = agent;
    next();
  } catch (error) {
    console.error("Authentication error:", error);
    res.status(500).json({ success: false, error: "Authentication error" });
  }
};

const authenticateApiKey = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];

    if (!authHeader) {
      return res.status(401).json({ success: false, error: "Authorization header required" });
    }

    let apiKey = authHeader;
    if (authHeader.startsWith('Bearer ')) {
      apiKey = authHeader.substring(7);
    }

    if (!apiKey) {
      return res.status(401).json({ success: false, error: "API key missing" });
    }

    const agent = await AgentModel.findByApiKey(apiKey);

    if (!agent) {
      return res.status(401).json({ success: false, error: "Invalid API key" });
    }

    if (agent.status === 'pending') {
      return res.status(403).json({ success: false, error: "Agent registration is pending approval" });
    }

    req.agent = agent;
    next();
  } catch (error) {
    console.error("API key authentication error:", error);
    res.status(500).json({ success: false, error: "Authentication error" });
  }
};

// GET all agents
router.get("/", authMiddleware, async (req, res) => {
  try {
    const agents = await AgentModel.getAll();

    res.json({
      success: true,
      count: agents.length,
      agents: agents.map(agent => ({
        id: agent.id,
        name: agent.name,
        company: agent.company_name,
        department: agent.department_name,
        hostname: agent.hostname,
        platform: agent.platform,
        status: agent.status,
        lastSeen: agent.last_seen,
        registeredAt: agent.registered_at,
        printerCount: agent.printer_count || 0,
        ip: agent.ip_address,
        isOnline: agent.status === 'online'
      })),
      accessedBy: req.user.email,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("Error getting agents:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// Register new agent
router.post("/register", async (req, res) => {
  await registerAgent(req, res);
});

// Agent heartbeat
router.post("/:agentId/heartbeat", authenticateAgent, async (req, res) => {
  await handleAgentHeartbeat(req, res);
});

// Sync printers
router.post("/:agentId/printers/sync", authenticateAgent, async (req, res) => {
  await syncPrinters(req, res);
});

// Get specific agent
router.get("/:agentId", authMiddleware, async (req, res) => {
  try {
    const { agentId } = req.params;
    const agent = await AgentModel.findById(agentId);

    if (!agent) {
      return res.status(404).json({ success: false, error: "Agent not found" });
    }

    const printers = await PrinterModel.findByAgent(agentId);

    res.json({
      success: true,
      agent: {
        id: agent.id,
        name: agent.name,
        company: agent.company_name,
        department: agent.department_name,
        contactPerson: agent.contact_person,
        status: agent.status,
        lastSeen: agent.last_seen,
        registeredAt: agent.registered_at,
        hostname: agent.hostname,
        platform: agent.platform,
        ip: agent.ip_address,
        macAddress: agent.mac_address,
        apiKey: agent.api_key,
        agentToken: agent.agent_token,
        createdAt: agent.created_at,
        updatedAt: agent.updated_at
      },
      printers: printers.map(p => ({
        name: p.name,
        displayName: p.displayName,
        ipAddress: p.ipAddress,
        status: p.status,
        printerStatusDetail: p.printerStatusDetail,
        inkLevels: p.inkLevels,
        lowInkColors: p.lowInkColors,
        pagesToday: p.pagesToday,
        totalPages: p.totalPages,
        colorPagesToday: p.colorPagesToday,
        bwPagesToday: p.bwPagesToday,
        colorPagesTotal: p.colorPagesTotal,
        bwPagesTotal: p.bwPagesTotal,
        lastPrintTime: p.lastPrintTime,
        vendor: p.vendor,
        isNetwork: p.isNetwork
      })),
      statistics: {
        printerCount: printers.length,
        totalPagesToday: printers.reduce((sum, p) => sum + (p.pagesToday || 0), 0),
        totalPages: printers.reduce((sum, p) => sum + (p.totalPages || 0), 0)
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("Error getting agent:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// Get agent API key (admin only)
router.get("/:id/api-key", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }

    const agent = await AgentModel.findById(id);

    if (!agent) {
      return res.status(404).json({ success: false, error: 'Agent not found' });
    }

    res.json({
      success: true,
      agentId: id,
      apiKey: agent.api_key
    });
  } catch (error) {
    console.error("Error getting agent API key:", error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Get printers for agent
router.get("/:agentId/printers", authenticateApiKey, async (req, res) => {
  try {
    const { agentId } = req.params;
    const { status, hasLowInk } = req.query;

    let printers = await PrinterModel.findByAgent(agentId);

    // Apply filters
    if (status) {
      printers = printers.filter(p => p.status === status);
    }
    if (hasLowInk === 'true') {
      printers = printers.filter(p => p.lowInkColors.length > 0);
    }

    res.json({
      success: true,
      count: printers.length,
      printers: printers.map(p => ({
        id: p.id,
        name: p.name,
        displayName: p.displayName,
        status: p.status,
        printerStatusDetail: p.printerStatusDetail,
        inkLevels: p.inkLevels,
        lowInkColors: p.lowInkColors,
        pagesToday: p.pagesToday,
        totalPages: p.totalPages,
        colorPagesToday: p.colorPagesToday,
        bwPagesToday: p.bwPagesToday,
        colorPagesTotal: p.colorPagesTotal,
        bwPagesTotal: p.bwPagesTotal,
        lastPrintTime: p.lastPrintTime,
        ipAddress: p.ipAddress,
        isNetwork: p.isNetwork,
        vendor: p.vendor
      })),
      summary: {
        total: printers.length,
        ready: printers.filter(p => p.status === 'ready').length,
        printing: printers.filter(p => p.status === 'printing').length,
        offline: printers.filter(p => p.status === 'offline').length,
        withLowInk: printers.filter(p => p.lowInkColors.length > 0).length
      },
      agentId,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("Error getting printers:", error);
    res.status(500).json({ success: false, error: "Failed to get printers" });
  }
});

// Get specific printer by name
router.get("/:agentId/printer", authenticateApiKey, async (req, res) => {
  try {
    const { agentId } = req.params;
    const { name } = req.query;

    if (!name) {
      return res.status(400).json({
        success: false,
        error: "Printer name is required as query parameter: ?name=PrinterName"
      });
    }

    const printer = await PrinterModel.findOne(agentId, name);

    if (!printer) {
      return res.status(404).json({
        success: false,
        error: `Printer "${name}" not found for agent ${agentId}`
      });
    }

    res.json({
      success: true,
      printer: {
        id: printer.id,
        name: printer.name,
        displayName: printer.displayName,
        status: printer.status,
        printerStatusDetail: printer.printerStatusDetail,
        inkLevels: printer.inkLevels,
        lowInkColors: printer.lowInkColors,
        pagesToday: printer.pagesToday,
        totalPages: printer.totalPages,
        colorPagesToday: printer.colorPagesToday,
        bwPagesToday: printer.bwPagesToday,
        colorPagesTotal: printer.colorPagesTotal,
        bwPagesTotal: printer.bwPagesTotal,
        lastPrintTime: printer.lastPrintTime,
        ipAddress: printer.ipAddress,
        isNetwork: printer.isNetwork,
        vendor: printer.vendor
      },
      agentId,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("Error getting printer:", error);
    res.status(500).json({ success: false, error: "Failed to get printer" });
  }
});

// Update printer status
router.put("/:agentId/printer/:printerName", authenticateApiKey, async (req, res) => {
  try {
    const { agentId, printerName } = req.params;
    const updates = req.body;

    const allowedUpdates = ['status', 'printerStatusDetail', 'inkLevels', 'pagesToday',
      'totalPages', 'lastPrintTime', 'colorPagesToday', 'bwPagesToday',
      'colorPagesTotal', 'bwPagesTotal', 'lowInkColors'];

    const invalidFields = Object.keys(updates).filter(key => !allowedUpdates.includes(key));
    if (invalidFields.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Invalid update fields: ${invalidFields.join(', ')}`
      });
    }

    const success = await PrinterModel.update(agentId, printerName, updates);

    if (success) {
      res.json({
        success: true,
        message: "Printer updated successfully",
        agentId,
        printerName,
        updates
      });
    } else {
      res.status(500).json({ success: false, error: "Failed to update printer" });
    }
  } catch (error) {
    console.error("Error updating printer:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// Record print event
router.post("/:agentId/print", authenticateAgent, async (req, res) => {
  try {
    const { agentId } = req.params;
    const { printerName, pages, color } = req.body;

    if (!printerName || !pages) {
      return res.status(400).json({
        success: false,
        error: "printerName and pages are required"
      });
    }

    await PrinterModel.savePrintEvent(agentId, printerName, pages, color || false);

    res.json({
      success: true,
      message: "Print event recorded",
      agentId,
      printerName,
      pages,
      color: color || false,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("Error recording print event:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// Get daily print data
router.get("/print/daily", authenticateApiKey, async (req, res) => {
  try {
    const { date, agentId } = req.query;
    const data = await PrinterModel.getDailyPrintData(agentId || null, date || null);

    if (data) {
      res.json({ success: true, data });
    } else {
      res.status(404).json({ success: false, error: "No print data found" });
    }
  } catch (error) {
    console.error("Error getting daily print data:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// Pause printer
router.post("/:agentId/printer/pause", authenticateApiKey, async (req, res) => {
  try {
    const { agentId } = req.params;
    const { printerName } = req.body;

    if (!printerName) {
      return res.status(400).json({ success: false, error: "printerName is required" });
    }

    const ws = connectionManager.getAgent(agentId);
    if (!ws) {
      // Update database only
      await PrinterModel.update(agentId, printerName, { status: "paused" });
      return res.json({
        success: true,
        message: `Printer ${printerName} marked as paused (agent offline)`,
        warning: "Agent is offline, status updated in database only"
      });
    }

    const commandId = `cmd_${Date.now()}`;
    ws.send(JSON.stringify({
      type: "command",
      commandId,
      action: "pause_printer",
      printerName,
      timestamp: new Date().toISOString()
    }));

    await PrinterModel.update(agentId, printerName, { status: "paused" });

    res.json({
      success: true,
      message: `Pause command sent to printer: ${printerName}`,
      commandId
    });
  } catch (error) {
    console.error("Error pausing printer:", error);
    res.status(500).json({ success: false, error: "Failed to pause printer" });
  }
});

// Resume printer
router.post("/:agentId/printer/resume", authenticateApiKey, async (req, res) => {
  try {
    const { agentId } = req.params;
    const { printerName } = req.body;

    if (!printerName) {
      return res.status(400).json({ success: false, error: "printerName is required" });
    }

    const ws = connectionManager.getAgent(agentId);
    if (!ws) {
      await PrinterModel.update(agentId, printerName, { status: "ready" });
      return res.json({
        success: true,
        message: `Printer ${printerName} marked as ready (agent offline)`,
        warning: "Agent is offline, status updated in database only"
      });
    }

    const commandId = `cmd_${Date.now()}`;
    ws.send(JSON.stringify({
      type: "command",
      commandId,
      action: "resume_printer",
      printerName,
      timestamp: new Date().toISOString()
    }));

    await PrinterModel.update(agentId, printerName, { status: "ready" });

    res.json({
      success: true,
      message: `Resume command sent to printer: ${printerName}`,
      commandId
    });
  } catch (error) {
    console.error("Error resuming printer:", error);
    res.status(500).json({ success: false, error: "Failed to resume printer" });
  }
});

// Delete agent
router.delete("/:agentId", authMiddleware, async (req, res) => {
  try {
    const { agentId } = req.params;

    const agent = await AgentModel.findById(agentId);
    if (!agent) {
      return res.status(404).json({ success: false, error: "Agent not found" });
    }

    await AgentModel.delete(agentId);

    res.json({
      success: true,
      message: `Agent ${agentId} deleted successfully`
    });
  } catch (error) {
    console.error("Error deleting agent:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

export default router;