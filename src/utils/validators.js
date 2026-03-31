import { AgentModel } from '../models/agent.model.js';

//  AGENT VALIDATORS 
export const validateAgentRegistration = (req, res, next) => {
  const { hostname, macAddress, contactPerson } = req.body;

  const errors = [];

  if (!hostname || typeof hostname !== 'string' || hostname.trim().length === 0) {
    errors.push('hostname is required and must be a non-empty string');
  }

  if (!macAddress || typeof macAddress !== 'string' || !isValidMacAddress(macAddress)) {
    errors.push('macAddress is required and must be a valid MAC address (e.g., 00:11:22:33:44:55)');
  }

  if (!contactPerson || typeof contactPerson !== 'string' || contactPerson.trim().length === 0) {
    errors.push('contactPerson is required and must be a non-empty string');
  }

  // Optional fields validation
  if (req.body.platform && !['windows', 'linux', 'macos', 'win32'].includes(req.body.platform)) {
    errors.push('platform must be one of: windows, linux, macos, win32');
  }

  if (req.body.departmentId && isNaN(parseInt(req.body.departmentId))) {
    errors.push('departmentId must be a number');
  }

  if (req.body.apiKey && typeof req.body.apiKey !== 'string') {
    errors.push('apiKey must be a string');
  }

  if (req.body.agentToken && typeof req.body.agentToken !== 'string') {
    errors.push('agentToken must be a string');
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors
    });
  }

  next();
};

export const validateAgentId = (req, res, next) => {
  const { agentId } = req.params;

  if (!agentId || typeof agentId !== 'string' || agentId.trim().length === 0) {
    return res.status(400).json({
      success: false,
      error: 'agentId is required and must be a non-empty string'
    });
  }

  next();
};

export const validateHeartbeat = (req, res, next) => {
  const { cpu_usage, memory_usage, printer_count } = req.body;

  const errors = [];

  if (cpu_usage !== undefined && (isNaN(cpu_usage) || cpu_usage < 0 || cpu_usage > 100)) {
    errors.push('cpu_usage must be a number between 0 and 100');
  }

  if (memory_usage !== undefined && (isNaN(memory_usage) || memory_usage < 0 || memory_usage > 100)) {
    errors.push('memory_usage must be a number between 0 and 100');
  }

  if (printer_count !== undefined && (isNaN(printer_count) || printer_count < 0)) {
    errors.push('printer_count must be a non-negative number');
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors
    });
  }

  next();
};

// PRINTER VALIDATORS 

export const validatePrinterName = (req, res, next) => {
  const { printerName } = req.params;
  const { name } = req.query;

  const targetName = printerName || name;

  if (!targetName || typeof targetName !== 'string' || targetName.trim().length === 0) {
    return res.status(400).json({
      success: false,
      error: 'printer name is required and must be a non-empty string'
    });
  }

  next();
};

export const validatePrintEvent = (req, res, next) => {
  const { printerName, pages, color } = req.body;

  const errors = [];

  if (!printerName || typeof printerName !== 'string' || printerName.trim().length === 0) {
    errors.push('printerName is required and must be a non-empty string');
  }

  if (pages === undefined || isNaN(pages) || pages <= 0 || pages > 10000) {
    errors.push('pages is required and must be a positive number (max 10000)');
  }

  if (color !== undefined && typeof color !== 'boolean') {
    errors.push('color must be a boolean (true/false)');
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors
    });
  }

  next();
};

export const validatePrinterUpdate = (req, res, next) => {
  const updates = req.body;

  const allowedFields = [
    'status', 'printerStatusDetail', 'inkLevels', 'pagesToday',
    'totalPages', 'lastPrintTime', 'colorPagesToday', 'bwPagesToday',
    'colorPagesTotal', 'bwPagesTotal', 'lowInkColors'
  ];

  const errors = [];

  Object.keys(updates).forEach(field => {
    if (!allowedFields.includes(field)) {
      errors.push(`Field '${field}' is not allowed for update`);
    }
  });

  // Type validations
  if (updates.pagesToday !== undefined && (isNaN(updates.pagesToday) || updates.pagesToday < 0)) {
    errors.push('pagesToday must be a non-negative number');
  }

  if (updates.totalPages !== undefined && (isNaN(updates.totalPages) || updates.totalPages < 0)) {
    errors.push('totalPages must be a non-negative number');
  }

  if (updates.inkLevels !== undefined && typeof updates.inkLevels !== 'object') {
    errors.push('inkLevels must be an object');
  }

  if (updates.lowInkColors !== undefined && !Array.isArray(updates.lowInkColors)) {
    errors.push('lowInkColors must be an array');
  }

  if (updates.printerStatusDetail !== undefined) {
    const validStatuses = [
      'ready', 'printing', 'offline', 'paused',
      'paper_jam', 'out_of_paper', 'door_open',
      'low_ink', 'no_ink', 'error_other', 'unknown'
    ];
    if (!validStatuses.includes(updates.printerStatusDetail)) {
      errors.push(`printerStatusDetail must be one of: ${validStatuses.join(', ')}`);
    }
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors
    });
  }

  next();
};

// AUTH VALIDATORS 

export const validateAgentLogin = (req, res, next) => {
  const { agent_id, api_key } = req.body;

  const errors = [];

  if (!agent_id || typeof agent_id !== 'string' || agent_id.trim().length === 0) {
    errors.push('agent_id is required and must be a non-empty string');
  }

  if (!api_key || typeof api_key !== 'string' || api_key.trim().length === 0) {
    errors.push('api_key is required and must be a non-empty string');
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors
    });
  }

  next();
};

export const validateAdminLogin = (req, res, next) => {
  const { email, password } = req.body;

  const errors = [];

  if (!email || typeof email !== 'string' || !isValidEmail(email)) {
    errors.push('email is required and must be a valid email address');
  }

  if (!password || typeof password !== 'string' || password.length < 6) {
    errors.push('password is required and must be at least 6 characters');
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors
    });
  }

  next();
};

// COMPANY/DEPARTMENT VALIDATORS 

export const validateCompany = (req, res, next) => {
  const { name } = req.body;

  const errors = [];

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    errors.push('company name is required and must be a non-empty string');
  }

  if (req.body.email && !isValidEmail(req.body.email)) {
    errors.push('email must be a valid email address');
  }

  if (req.body.phone && typeof req.body.phone !== 'string') {
    errors.push('phone must be a string');
  }

  if (req.body.website && !isValidUrl(req.body.website)) {
    errors.push('website must be a valid URL');
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors
    });
  }

  next();
};

export const validateDepartment = (req, res, next) => {
  const { name } = req.body;
  const { companyId } = req.params;

  const errors = [];

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    errors.push('department name is required and must be a non-empty string');
  }

  if (companyId && typeof companyId !== 'string') {
    errors.push('companyId must be a string');
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors
    });
  }

  next();
};

// REPORT VALIDATORS 

export const validateDateRange = (req, res, next) => {
  const { startDate, endDate, date } = req.query;

  if (date && !isValidDate(date)) {
    return res.status(400).json({
      success: false,
      error: 'date must be in YYYY-MM-DD format'
    });
  }

  if (startDate && !isValidDate(startDate)) {
    return res.status(400).json({
      success: false,
      error: 'startDate must be in YYYY-MM-DD format'
    });
  }

  if (endDate && !isValidDate(endDate)) {
    return res.status(400).json({
      success: false,
      error: 'endDate must be in YYYY-MM-DD format'
    });
  }

  if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
    return res.status(400).json({
      success: false,
      error: 'startDate cannot be after endDate'
    });
  }

  next();
};

export const validateMonthlyReport = (req, res, next) => {
  const { year, month } = req.query;

  if (!year || !month) {
    return res.status(400).json({
      success: false,
      error: 'year and month are required'
    });
  }

  const yearNum = parseInt(year);
  const monthNum = parseInt(month);

  if (isNaN(yearNum) || yearNum < 2000 || yearNum > 2100) {
    return res.status(400).json({
      success: false,
      error: 'year must be a valid year between 2000-2100'
    });
  }

  if (isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
    return res.status(400).json({
      success: false,
      error: 'month must be between 1-12'
    });
  }

  next();
};

// ==================== WEBSOCKET COMMAND VALIDATOR ====================

export const validateWebSocketCommand = (req, res, next) => {
  const { command } = req.body;

  const validCommands = ['pause_printer', 'resume_printer', 'test_page', 'cancel_job', 'refresh_status'];

  if (!command || typeof command !== 'string') {
    return res.status(400).json({
      success: false,
      error: 'command is required and must be a string'
    });
  }

  if (!validCommands.includes(command)) {
    return res.status(400).json({
      success: false,
      error: `command must be one of: ${validCommands.join(', ')}`
    });
  }

  next();
};

// ==================== HELPER FUNCTIONS ====================

function isValidMacAddress(mac) {
  const macRegex = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/;
  return macRegex.test(mac);
}

function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function isValidUrl(url) {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

function isValidDate(dateStr) {
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(dateStr)) return false;

  const date = new Date(dateStr);
  return date instanceof Date && !isNaN(date);
}

// ==================== ASYNC VALIDATORS (DB CHECKS) ====================

export const checkAgentExists = async (req, res, next) => {
  try {
    const { agentId } = req.params;

    const agent = await AgentModel.findById(agentId);

    if (!agent) {
      return res.status(404).json({
        success: false,
        error: `Agent with ID '${agentId}' not found`
      });
    }

    req.agentData = agent;
    next();
  } catch (error) {
    console.error('Error checking agent existence:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error during validation'
    });
  }
};

export const checkAgentActive = (req, res, next) => {
  const agent = req.agentData;

  if (agent.status === 'blocked') {
    return res.status(403).json({
      success: false,
      error: `Agent is blocked: ${agent.blocked_reason || 'No reason provided'}`
    });
  }

  if (agent.status === 'pending') {
    return res.status(403).json({
      success: false,
      error: 'Agent registration is pending approval'
    });
  }

  next();
};

// ==================== PAGINATION VALIDATOR ====================

export const validatePagination = (req, res, next) => {
  const { page, limit } = req.query;

  const pagination = {
    page: 1,
    limit: 20
  };

  if (page !== undefined) {
    const pageNum = parseInt(page);
    if (isNaN(pageNum) || pageNum < 1) {
      return res.status(400).json({
        success: false,
        error: 'page must be a positive integer'
      });
    }
    pagination.page = pageNum;
  }

  if (limit !== undefined) {
    const limitNum = parseInt(limit);
    if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
      return res.status(400).json({
        success: false,
        error: 'limit must be an integer between 1 and 100'
      });
    }
    pagination.limit = limitNum;
  }

  req.pagination = pagination;
  next();
};

// ==================== EXPORT ALL ====================

export default {
  // Agent
  validateAgentRegistration,
  validateAgentId,
  validateHeartbeat,

  // Printer
  validatePrinterName,
  validatePrintEvent,
  validatePrinterUpdate,

  // Auth
  validateAgentLogin,
  validateAdminLogin,

  // Company/Department
  validateCompany,
  validateDepartment,

  // Reports
  validateDateRange,
  validateMonthlyReport,

  // WebSocket
  validateWebSocketCommand,

  // Async validators
  checkAgentExists,
  checkAgentActive,

  // Pagination
  validatePagination
};