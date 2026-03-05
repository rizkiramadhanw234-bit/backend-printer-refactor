import express from "express";
import { pool } from "../config/database.js";

const router = express.Router();

// Simulate database
let printers = new Map();

// Get all printers
router.get("/", async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT * FROM agent_printers 
      ORDER BY created_at DESC
    `);

    res.json({
      success: true,
      count: rows.length,
      printers: rows,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch printers'
    });
  }
});

// Get printer by agent and name
router.get("/:agentId/:printerName", (req, res) => {
  const { agentId, printerName } = req.params;
  const printerKey = `${agentId}:${printerName}`;

  if (!printers.has(printerKey)) {
    return res.status(404).json({
      success: false,
      error: "Printer not found",
    });
  }

  const printer = printers.get(printerKey);

  res.json({
    success: true,
    printer,
    timestamp: new Date().toISOString(),
  });
});

// Update printer status
router.post("/:agentId/:printerName/status", (req, res) => {
  const { agentId, printerName } = req.params;
  const { status, pages, inkLevels } = req.body;
  const printerKey = `${agentId}:${printerName}`;

  const printer = printers.get(printerKey) || {
    agentId,
    name: printerName,
    created: new Date().toISOString(),
  };

  printer.status = status || printer.status;
  printer.lastUpdate = new Date().toISOString();

  if (pages !== undefined) {
    printer.totalPages = (printer.totalPages || 0) + pages;
    printer.lastPrint = new Date().toISOString();
  }

  if (inkLevels) {
    printer.inkLevels = inkLevels;
    printer.lastInkUpdate = new Date().toISOString();
  }

  printers.set(printerKey, printer);

  res.json({
    success: true,
    message: "Printer status updated",
    printer,
    timestamp: new Date().toISOString(),
  });
});

// Get print history
router.get("/:agentId/:printerName/history", (req, res) => {
  const { agentId, printerName } = req.params;
  const { days = 7 } = req.query;

  // Simulate history data
  const history = [];
  const today = new Date();

  for (let i = 0; i < days; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split("T")[0];

    history.push({
      date: dateStr,
      pages: Math.floor(Math.random() * 50),
      agentId,
      printerName,
    });
  }

  res.json({
    success: true,
    history,
    days,
    timestamp: new Date().toISOString(),
  });
});

export default router;
