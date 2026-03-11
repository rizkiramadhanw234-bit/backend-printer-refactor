import express from 'express';
import { reportService } from '../services/report.service.js';
import {
  validateDateRange,
  validateMonthlyReport
} from '../utils/validators.js';

const router = express.Router();

// GET /api/reports/daily
router.get('/daily', validateDateRange, async (req, res) => {
  try {
    const { date, agentId, companyId } = req.query;

    const report = await reportService.generateDailyReport(date, {
      agentId,
      companyId
    });

    res.json({
      success: true,
      ...report,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error generating daily report:', error);
    res.status(500).json({ success: false, error: 'Failed to generate report' });
  }
});

// GET /api/reports/monthly
router.get('/monthly', validateMonthlyReport, async (req, res) => {
  try {
    const { year, month, agentId, companyId } = req.query;

    const report = await reportService.generateMonthlyReport(
      parseInt(year),
      parseInt(month),
      { agentId, companyId }
    );

    res.json({
      success: true,
      ...report,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error generating monthly report:', error);
    res.status(500).json({ success: false, error: 'Failed to generate report' });
  }
});

// GET /api/reports/printer/:printerName/lifetime
router.get('/printer/:printerName/lifetime', async (req, res) => {
  try {
    const { printerName } = req.params;
    const decodedName = decodeURIComponent(printerName);

    const report = await reportService.generatePrinterLifetimeReport(decodedName);

    if (!report) {
      return res.status(404).json({
        success: false,
        error: 'Printer not found'
      });
    }

    res.json({
      success: true,
      ...report
    });
  } catch (error) {
    console.error('Error generating printer report:', error);
    res.status(500).json({ success: false, error: 'Failed to generate report' });
  }
});

// GET /api/reports/company/:companyId
router.get('/company/:companyId', validateDateRange, async (req, res) => {
  try {
    const { companyId } = req.params;
    const { startDate, endDate } = req.query;

    const report = await reportService.generateCompanyReport(
      companyId,
      startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      endDate || new Date().toISOString().split('T')[0]
    );

    if (!report) {
      return res.status(404).json({
        success: false,
        error: 'Company not found or no data'
      });
    }

    res.json({
      success: true,
      ...report,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error generating company report:', error);
    res.status(500).json({ success: false, error: 'Failed to generate report' });
  }
});

// GET /api/reports/export
router.get('/export', async (req, res) => {
  try {
    const { type, date, year, month, printerName } = req.query;

    let reportData;
    let csv;

    switch (type) {
      case 'daily':
        reportData = await reportService.generateDailyReport(date);
        csv = await reportService.exportToCSV(reportData, 'daily');
        break;
      case 'monthly':
        reportData = await reportService.generateMonthlyReport(
          parseInt(year),
          parseInt(month)
        );
        csv = await reportService.exportToCSV(reportData, 'monthly');
        break;
      case 'printer':
        reportData = await reportService.generatePrinterLifetimeReport(
          decodeURIComponent(printerName)
        );
        csv = await reportService.exportToCSV(reportData, 'printer');
        break;
      default:
        return res.status(400).json({
          success: false,
          error: 'Invalid export type'
        });
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=report-${type}-${Date.now()}.csv`);
    res.send(csv);
  } catch (error) {
    console.error('Error exporting report:', error);
    res.status(500).json({ success: false, error: 'Failed to export report' });
  }
});

export default router;