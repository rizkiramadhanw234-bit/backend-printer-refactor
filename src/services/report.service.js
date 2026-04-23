import { pool } from '../config/database.js';
import { PrinterModel } from '../models/printer.model.js';
import { AgentModel } from '../models/agent.model.js';
import { logger } from '../utils/logger.js';

export class ReportService {

    async generateDailyReport(date = null, filters = {}) {
        const targetDate = date || new Date().toISOString().split('T')[0];
        const { agentId, companyId } = filters;

        try {
            const params = [targetDate];
            let agentFilter = '';

            if (agentId) {
                agentFilter += ' AND dr.agent_id = ?';
                params.push(agentId);
            }

            const [drRows] = await pool.execute(`
                SELECT 
                    dr.agent_id,
                    dr.total_pages,
                    dr.printer_count,
                    a.name as agent_name
                FROM daily_reports dr
                JOIN agents a ON dr.agent_id = a.id
                WHERE dr.report_date = ?
                ${agentFilter}
                ORDER BY dr.total_pages DESC
            `, params);

            if (drRows.length > 0) {
                const totalPages = drRows.reduce((sum, r) => sum + parseInt(r.total_pages || 0), 0);

                // Ambil detail printer dari print_history + color/bw breakdown
                const phParams = [targetDate, targetDate];
                if (agentId) phParams.push(agentId);

                const [phRows] = await pool.execute(`
                    SELECT 
                        agent_id,
                        printer_name,
                        SUM(pages) as pages,
                        SUM(CASE WHEN color = 1 THEN pages ELSE 0 END) as color_pages,
                        SUM(CASE WHEN color = 0 THEN pages ELSE 0 END) as bw_pages
                    FROM print_history
                    WHERE print_date = ?
                    OR DATE(printed_at) = ?
                    ${agentId ? 'AND agent_id = ?' : ''}
                    GROUP BY agent_id, printer_name
                    ORDER BY pages DESC
                `, phParams);

                // Build byAgent dari daily_reports
                const byAgent = drRows.map(r => ({
                    agentId: r.agent_id,
                    agentName: r.agent_name,
                    pages: parseInt(r.total_pages || 0),
                    printers: phRows
                        .filter(p => p.agent_id === r.agent_id)
                        .map(p => ({
                            name: p.printer_name,
                            pages: parseInt(p.pages || 0),
                            colorPages: parseInt(p.color_pages || 0),
                            bwPages: parseInt(p.bw_pages || 0),
                        }))
                }));

                // Hitung total color/bw dari phRows
                const totalColorPages = phRows.reduce((sum, p) => sum + parseInt(p.color_pages || 0), 0);
                const totalBwPages = phRows.reduce((sum, p) => sum + parseInt(p.bw_pages || 0), 0);

                // Build byPrinter
                const byPrinter = phRows.length > 0
                    ? phRows.map(p => ({
                        name: p.printer_name,
                        agentId: p.agent_id,
                        agentName: drRows.find(r => r.agent_id === p.agent_id)?.agent_name || p.agent_id,
                        pages: parseInt(p.pages || 0),
                        colorPages: parseInt(p.color_pages || 0),
                        bwPages: parseInt(p.bw_pages || 0),
                    }))
                    : [];

                return {
                    date: targetDate,
                    totalPages,
                    totalColorPages,
                    totalBwPages,
                    agentCount: drRows.length,
                    printerCount: byPrinter.length || drRows.reduce((sum, r) => sum + parseInt(r.printer_count || 0), 0),
                    byAgent,
                    byPrinter,
                    source: 'daily_reports'
                };
            }

            // Fallback: dari PrinterModel.getDailyPrintData
            const printData = await PrinterModel.getDailyPrintData(agentId || null, targetDate);

            if (printData && printData.printers.length > 0) {
                const byAgent = new Map();
                const byPrinter = new Map();

                printData.printers.forEach(item => {
                    if (!byAgent.has(item.agentId)) {
                        byAgent.set(item.agentId, {
                            agentId: item.agentId,
                            agentName: item.agentName || item.agentId,
                            pages: 0,
                            colorPages: 0,
                            bwPages: 0,
                            printers: []
                        });
                    }
                    const agent = byAgent.get(item.agentId);
                    agent.pages += parseInt(item.pages || 0);
                    agent.colorPages += parseInt(item.colorPages || item.color_pages || 0);
                    agent.bwPages += parseInt(item.bwPages || item.bw_pages || 0);
                    agent.printers.push({
                        name: item.name,
                        pages: parseInt(item.pages || 0),
                        colorPages: parseInt(item.colorPages || item.color_pages || 0),
                        bwPages: parseInt(item.bwPages || item.bw_pages || 0),
                    });

                    byPrinter.set(`${item.agentId}:${item.name}`, {
                        name: item.name,
                        agentId: item.agentId,
                        agentName: item.agentName || item.agentId,
                        pages: parseInt(item.pages || 0),
                        colorPages: parseInt(item.colorPages || item.color_pages || 0),
                        bwPages: parseInt(item.bwPages || item.bw_pages || 0),
                    });
                });

                const agentArr = Array.from(byAgent.values()).sort((a, b) => b.pages - a.pages);

                return {
                    date: targetDate,
                    totalPages: agentArr.reduce((sum, a) => sum + a.pages, 0),
                    totalColorPages: agentArr.reduce((sum, a) => sum + a.colorPages, 0),
                    totalBwPages: agentArr.reduce((sum, a) => sum + a.bwPages, 0),
                    agentCount: byAgent.size,
                    printerCount: byPrinter.size,
                    byAgent: agentArr,
                    byPrinter: Array.from(byPrinter.values()).sort((a, b) => b.pages - a.pages),
                    source: 'print_history'
                };
            }

            // Kosong
            return {
                date: targetDate,
                totalPages: 0,
                totalColorPages: 0,
                totalBwPages: 0,
                agentCount: 0,
                printerCount: 0,
                byAgent: [],
                byPrinter: [],
                source: 'none'
            };

        } catch (error) {
            console.error('Error generating daily report:', error);
            throw error;
        }
    }

    /**
     * Generate monthly report
     */
    async generateMonthlyReport(year, month, filters = {}) {
        const { agentId, companyId } = filters;
        const startDate = `${year}-${month.toString().padStart(2, '0')}-01`;
        const endDate = new Date(year, month, 0).toISOString().split('T')[0];

        try {
            let dailyData = [];
            try {
                const [rows] = await pool.execute(`
                    SELECT 
                        DATE(printed_at) as print_date,
                        COALESCE(SUM(pages), 0) as total_pages,
                        SUM(CASE WHEN color = 1 THEN pages ELSE 0 END) as color_pages,
                        SUM(CASE WHEN color = 0 THEN pages ELSE 0 END) as bw_pages,
                        COUNT(DISTINCT agent_id) as active_agents,
                        COUNT(DISTINCT printer_name) as active_printers
                    FROM print_history
                    WHERE DATE(printed_at) BETWEEN ? AND ?
                    ${agentId ? 'AND agent_id = ?' : ''}
                    GROUP BY DATE(printed_at)
                    ORDER BY print_date
                `, [startDate, endDate, agentId].filter(Boolean));
                dailyData = rows;
            } catch (err) {
                console.log('No print_history data yet');
            }

            if (dailyData.length === 0) {
                return {
                    year, month,
                    summary: {
                        totalPages: 0,
                        totalColorPages: 0,
                        totalBwPages: 0,
                        averageDailyPages: 0,
                        totalPrintJobs: 0,
                        activeAgents: 0,
                        activePrinters: 0,
                        peakDay: null
                    },
                    dailyBreakdown: [],
                    byAgent: [],
                    byPrinter: []
                };
            }

            const [agentSummary] = await pool.execute(`
                SELECT 
                    a.id as agent_id, a.name as agent_name,
                    d.name as department_name, c.name as company_name,
                    COUNT(DISTINCT ph.id) as print_count,
                    SUM(ph.pages) as total_pages,
                    SUM(CASE WHEN ph.color = 1 THEN ph.pages ELSE 0 END) as color_pages,
                    SUM(CASE WHEN ph.color = 0 THEN ph.pages ELSE 0 END) as bw_pages,
                    MAX(ph.printed_at) as last_print
                FROM agents a
                LEFT JOIN print_history ph ON a.id = ph.agent_id 
                    AND DATE(ph.printed_at) BETWEEN ? AND ?
                LEFT JOIN departement d ON a.departement_id = d.id
                LEFT JOIN company c ON d.company_id = c.id
                WHERE 1=1
                ${companyId ? 'AND c.id = ?' : ''}
                GROUP BY a.id
                HAVING total_pages > 0
                ORDER BY total_pages DESC
            `, [startDate, endDate, companyId].filter(Boolean));

            const [printerSummary] = await pool.execute(`
                SELECT 
                    ap.name as printer_name, ap.display_name, ap.vendor,
                    a.id as agent_id, a.name as agent_name,
                    COUNT(DISTINCT ph.id) as print_count,
                    SUM(ph.pages) as total_pages,
                    SUM(CASE WHEN ph.color = 1 THEN ph.pages ELSE 0 END) as color_pages,
                    SUM(CASE WHEN ph.color = 0 THEN ph.pages ELSE 0 END) as bw_pages
                FROM agent_printers ap
                JOIN agents a ON ap.agent_id = a.id
                LEFT JOIN print_history ph ON ap.agent_id = ph.agent_id 
                    AND ap.name = ph.printer_name
                    AND DATE(ph.printed_at) BETWEEN ? AND ?
                WHERE 1=1
                ${agentId ? 'AND a.id = ?' : ''}
                ${companyId ? 'AND a.departement_id IN (SELECT id FROM departement WHERE company_id = ?)' : ''}
                GROUP BY ap.id
                HAVING total_pages > 0
                ORDER BY total_pages DESC
            `, [startDate, endDate, agentId, companyId].filter(Boolean));

            const totalPages = dailyData.reduce((sum, d) => sum + parseInt(d.total_pages || 0), 0);
            const totalColorPages = dailyData.reduce((sum, d) => sum + parseInt(d.color_pages || 0), 0);
            const totalBwPages = dailyData.reduce((sum, d) => sum + parseInt(d.bw_pages || 0), 0);
            const avgDailyPages = dailyData.length > 0 ? Math.round(totalPages / dailyData.length) : 0;

            const peakDay = dailyData.length > 0
                ? dailyData.reduce((max, d) =>
                    parseInt(d.total_pages) > parseInt(max.total_pages) ? d : max,
                    dailyData[0])
                : null;

            return {
                year, month,
                summary: {
                    totalPages,
                    totalColorPages,
                    totalBwPages,
                    averageDailyPages: avgDailyPages,
                    totalPrintJobs: agentSummary.reduce((sum, a) => sum + parseInt(a.print_count || 0), 0),
                    activeAgents: agentSummary.length,
                    activePrinters: printerSummary.length,
                    peakDay: peakDay ? {
                        date: peakDay.print_date,
                        pages: parseInt(peakDay.total_pages)
                    } : null
                },
                // dailyBreakdown sekarang include color/bw per hari
                dailyBreakdown: dailyData.map(d => ({
                    print_date: d.print_date,
                    total_pages: parseInt(d.total_pages || 0),
                    color_pages: parseInt(d.color_pages || 0),
                    bw_pages: parseInt(d.bw_pages || 0),
                    active_agents: parseInt(d.active_agents || 0),
                    active_printers: parseInt(d.active_printers || 0),
                })),
                byAgent: agentSummary.map(a => ({
                    agentId: a.agent_id,
                    agentName: a.agent_name,
                    departmentName: a.department_name,
                    companyName: a.company_name,
                    printCount: parseInt(a.print_count || 0),
                    pages: parseInt(a.total_pages || 0),
                    colorPages: parseInt(a.color_pages || 0),
                    bwPages: parseInt(a.bw_pages || 0),
                    lastPrint: a.last_print,
                })),
                byPrinter: printerSummary.map(p => ({
                    name: p.display_name || p.printer_name,
                    printerName: p.printer_name,
                    vendor: p.vendor,
                    agentId: p.agent_id,
                    agentName: p.agent_name,
                    printCount: parseInt(p.print_count || 0),
                    pages: parseInt(p.total_pages || 0),
                    colorPages: parseInt(p.color_pages || 0),
                    bwPages: parseInt(p.bw_pages || 0),
                })),
            };
        } catch (error) {
            logger.error('Error generating monthly report:', error);
            throw error;
        }
    }

    /**
     * Generate printer lifetime report
     */
    async generatePrinterLifetimeReport(printerName) {
        try {
            const [rows] = await pool.execute(`
                SELECT 
                    ap.name,
                    ap.display_name,
                    ap.vendor,
                    ap.ip_address,
                    ap.total_pages,
                    ap.color_pages_total,
                    ap.bw_pages_total,
                    ap.ink_levels,
                    ap.last_print_time,
                    ap.created_at,
                    a.id as agent_id,
                    a.name as agent_name,
                    d.name as department_name,
                    c.name as company_name,
                    COUNT(ph.id) as total_print_jobs,
                    MAX(ph.printed_at) as last_job_date
                FROM agent_printers ap
                JOIN agents a ON ap.agent_id = a.id
                LEFT JOIN departement d ON a.departement_id = d.id
                LEFT JOIN company c ON d.company_id = c.id
                LEFT JOIN print_history ph ON ap.agent_id = ph.agent_id AND ap.name = ph.printer_name
                WHERE ap.name LIKE ? OR ap.display_name LIKE ?
                GROUP BY ap.id
                LIMIT 1
            `, [`%${printerName}%`, `%${printerName}%`]);

            if (rows.length === 0) return null;

            const printer = rows[0];

            return {
                printerName: printer.display_name || printer.name,
                agent: {
                    id: printer.agent_id,
                    name: printer.agent_name
                },
                company: printer.company_name,
                department: printer.department_name,
                vendor: printer.vendor,
                ipAddress: printer.ip_address,
                lifetime: {
                    totalPages: parseInt(printer.total_pages || 0),
                    colorPages: parseInt(printer.color_pages_total || 0),
                    bwPages: parseInt(printer.bw_pages_total || 0),
                    printJobs: parseInt(printer.total_print_jobs || 0)
                },
                inkLevels: printer.ink_levels ? JSON.parse(printer.ink_levels) : {},
                firstSeen: printer.created_at,
                lastActive: printer.last_job_date || printer.last_print_time,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            logger.error('Error generating printer lifetime report:', error);
            throw error;
        }
    }

    /**
     * Generate company usage report
     */
    async generateCompanyReport(companyId, startDate, endDate) {
        try {
            const [rows] = await pool.execute(`
                SELECT 
                    c.id as company_id,
                    c.name as company_name,
                    COUNT(DISTINCT a.id) as total_agents,
                    COUNT(DISTINCT ap.id) as total_printers,
                    SUM(ph.pages) as total_pages,
                    SUM(CASE WHEN ph.color = 1 THEN ph.pages ELSE 0 END) as color_pages,
                    SUM(CASE WHEN ph.color = 0 THEN ph.pages ELSE 0 END) as bw_pages,
                    COUNT(DISTINCT ph.id) as total_print_jobs,
                    MIN(ph.printed_at) as first_print,
                    MAX(ph.printed_at) as last_print
                FROM company c
                LEFT JOIN departement d ON c.id = d.company_id
                LEFT JOIN agents a ON d.id = a.departement_id
                LEFT JOIN agent_printers ap ON a.id = ap.agent_id
                LEFT JOIN print_history ph ON ap.agent_id = ph.agent_id 
                    AND ap.name = ph.printer_name
                    AND ph.printed_at BETWEEN ? AND ?
                WHERE c.id = ?
                GROUP BY c.id
            `, [startDate, endDate, companyId]);

            if (rows.length === 0) return null;

            const report = rows[0];

            const [topPrinters] = await pool.execute(`
                SELECT 
                    ap.name as printer_name,
                    ap.display_name,
                    a.name as agent_name,
                    SUM(ph.pages) as total_pages,
                    SUM(CASE WHEN ph.color = 1 THEN ph.pages ELSE 0 END) as color_pages,
                    SUM(CASE WHEN ph.color = 0 THEN ph.pages ELSE 0 END) as bw_pages
                FROM agent_printers ap
                JOIN agents a ON ap.agent_id = a.id
                JOIN departement d ON a.departement_id = d.id
                LEFT JOIN print_history ph ON ap.agent_id = ph.agent_id 
                    AND ap.name = ph.printer_name
                    AND ph.printed_at BETWEEN ? AND ?
                WHERE d.company_id = ?
                GROUP BY ap.id
                HAVING total_pages > 0
                ORDER BY total_pages DESC
                LIMIT 10
            `, [startDate, endDate, companyId]);

            return {
                companyId: report.company_id,
                companyName: report.company_name,
                period: { startDate, endDate },
                summary: {
                    totalPages: parseInt(report.total_pages || 0),
                    colorPages: parseInt(report.color_pages || 0),
                    bwPages: parseInt(report.bw_pages || 0),
                    totalPrintJobs: parseInt(report.total_print_jobs || 0),
                    totalAgents: parseInt(report.total_agents || 0),
                    totalPrinters: parseInt(report.total_printers || 0)
                },
                timeline: {
                    firstPrint: report.first_print,
                    lastPrint: report.last_print
                },
                topPrinters: topPrinters.map(p => ({
                    name: p.display_name || p.printer_name,
                    agent: p.agent_name,
                    pages: parseInt(p.total_pages || 0),
                    colorPages: parseInt(p.color_pages || 0),
                    bwPages: parseInt(p.bw_pages || 0),
                }))
            };
        } catch (error) {
            logger.error('Error generating company report:', error);
            throw error;
        }
    }

    /**
     * Export report to CSV format
     */
    async exportToCSV(reportData, type = 'daily') {
        let csv = '';
        let headers = [];

        switch (type) {
            case 'daily':
                headers = ['Agent', 'Printer', 'Total Pages', 'Color Pages', 'BW Pages', 'Date'];
                csv = headers.join(',') + '\n';

                if (reportData.byPrinter) {
                    reportData.byPrinter.forEach(p => {
                        csv += `"${p.agentName}","${p.name}",${p.pages},${p.colorPages || 0},${p.bwPages || 0},"${reportData.date}"\n`;
                    });
                }
                break;

            case 'monthly':
                headers = ['Date', 'Total Pages', 'Color Pages', 'BW Pages', 'Active Agents', 'Active Printers'];
                csv = headers.join(',') + '\n';

                if (reportData.dailyBreakdown) {
                    reportData.dailyBreakdown.forEach(d => {
                        csv += `"${d.print_date}",${d.total_pages || 0},${d.color_pages || 0},${d.bw_pages || 0},${d.active_agents || 0},${d.active_printers || 0}\n`;
                    });
                }
                break;

            case 'printer':
                headers = ['Printer', 'Agent', 'Company', 'Total Pages', 'Color Pages', 'BW Pages', 'Last Active'];
                csv = headers.join(',') + '\n';

                csv += `"${reportData.printerName}","${reportData.agent.name}","${reportData.company || '-'}",${reportData.lifetime.totalPages},${reportData.lifetime.colorPages},${reportData.lifetime.bwPages},"${reportData.lastActive || '-'}"\n`;
                break;
        }

        return csv;
    }

    /**
     * Clean up old report data (for maintenance)
     */
    async cleanupOldReports(daysToKeep = 90) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

        try {
            const [result] = await pool.execute(
                'DELETE FROM print_history WHERE print_date < ?',
                [cutoffDate.toISOString().split('T')[0]]
            );

            logger.info(`🧹 Cleaned up ${result.affectedRows} old print history records`);
            return result.affectedRows;
        } catch (error) {
            logger.error('Error cleaning up old reports:', error);
            throw error;
        }
    }
}

export const reportService = new ReportService();