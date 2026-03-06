import { pool } from '../config/database.js';

export const PrinterModel = {
    normalizePrinterName(name) {
        if (!name || typeof name !== 'string') return name || '';
        const cleaned = name.replace(/^[\(\[]?\d{1,2}:\d{2}:\d{2}[\)\]]?\s*/i, '').trim();
        return cleaned;
    },

    async findByAgent(agentId) {
        const [rows] = await pool.execute(
            `SELECT * FROM agent_printers WHERE agent_id = ? ORDER BY name`,
            [agentId]
        );
        return rows.map(this.parsePrinterRow);
    },

    async findOne(agentId, printerName) {
        const [rows] = await pool.execute(
            `SELECT * FROM agent_printers WHERE agent_id = ? AND name = ?`,
            [agentId, printerName]
        );
        return rows[0] ? this.parsePrinterRow(rows[0]) : null;
    },

    async upsert(agentId, printerData) {
        const normalizedName = this.normalizePrinterName(printerData.name);

        const {
            display_name, ip_address, status, ink_levels,
            pages_today, total_pages, last_print_time, vendor, is_network,
            printer_status_detail, low_ink_colors,
            color_pages_today, bw_pages_today,
            color_pages_total, bw_pages_total
        } = printerData;

        const [existing] = await pool.execute(
            'SELECT total_pages, pages_today FROM agent_printers WHERE agent_id = ? AND name = ?',
            [agentId, normalizedName]
        );

        if (existing.length > 0) {
            const existingTotal = existing[0].total_pages || 0;
            const existingToday = existing[0].pages_today || 0;

            const finalTotalPages = Math.max(existingTotal, total_pages || 0);
            const finalPagesToday = Math.max(existingToday, pages_today || 0);

            console.log(`📊 Printer ${normalizedName}: DB total=${existingTotal}, Agent kirim=${total_pages}, Final=${finalTotalPages}`);

            await pool.execute(`
            UPDATE agent_printers SET
                display_name = ?,
                ip_address = ?,
                status = ?,
                ink_levels = ?,
                pages_today = ?,
                total_pages = ?,
                last_print_time = ?,
                vendor = ?,
                is_network = ?,
                printer_status_detail = ?,
                low_ink_colors = ?,
                color_pages_today = ?,
                bw_pages_today = ?,
                color_pages_total = ?,
                bw_pages_total = ?,
                updated_at = NOW()
            WHERE agent_id = ? AND name = ?
        `, [
                display_name || normalizedName,
                ip_address,
                status,
                JSON.stringify(ink_levels || {}),
                finalPagesToday,
                finalTotalPages,
                last_print_time,
                vendor,
                is_network ? 1 : 0,
                printer_status_detail || 'unknown',
                low_ink_colors ? JSON.stringify(low_ink_colors) : null,
                color_pages_today || 0,
                bw_pages_today || 0,
                color_pages_total || 0,
                bw_pages_total || 0,
                agentId,
                normalizedName
            ]);
        } else {
            await pool.execute(`
            INSERT INTO agent_printers (
                agent_id, name, display_name, ip_address, status, ink_levels,
                pages_today, total_pages, last_print_time, vendor, is_network,
                printer_status_detail, low_ink_colors,
                color_pages_today, bw_pages_today,
                color_pages_total, bw_pages_total,
                created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
        `, [
                agentId,
                normalizedName,
                display_name || normalizedName,
                ip_address,
                status,
                JSON.stringify(ink_levels || {}),
                pages_today || 0,
                total_pages || 0,
                last_print_time,
                vendor,
                is_network ? 1 : 0,
                printer_status_detail || 'unknown',
                low_ink_colors ? JSON.stringify(low_ink_colors) : null,
                color_pages_today || 0,
                bw_pages_today || 0,
                color_pages_total || 0,
                bw_pages_total || 0
            ]);
        }
    },

    async update(agentId, printerName, updates) {
        const normalizedName = this.normalizePrinterName(printerName);

        // Ambil data existing dulu
        const [existing] = await pool.execute(
            'SELECT total_pages, pages_today FROM agent_printers WHERE agent_id = ? AND name = ?',
            [agentId, normalizedName]
        );

        const fields = [];
        const values = [];

        const fieldMap = {
            status: 'status',
            printerStatusDetail: 'printer_status_detail',
            inkLevels: 'ink_levels',
            pagesToday: 'pages_today',
            totalPages: 'total_pages',
            colorPagesToday: 'color_pages_today',
            bwPagesToday: 'bw_pages_today',
            colorPagesTotal: 'color_pages_total',
            bwPagesTotal: 'bw_pages_total',
            lastPrintTime: 'last_print_time',
            lowInkColors: 'low_ink_colors'
        };

        Object.entries(updates).forEach(([key, value]) => {
            const dbField = fieldMap[key];
            if (dbField && value !== undefined) {

                if (key === 'totalPages' && existing.length > 0) {
                    const currentValue = existing[0].total_pages || 0;
                    const newValue = Math.max(currentValue, value || 0);
                    fields.push(`${dbField} = ?`);
                    values.push(newValue);
                    console.log(`Update totalPages: DB=${currentValue}, Request=${value}, Final=${newValue}`);
                }
                else if (key === 'pagesToday' && existing.length > 0) {
                    const currentValue = existing[0].pages_today || 0;
                    const newValue = Math.max(currentValue, value || 0);
                    fields.push(`${dbField} = ?`);
                    values.push(newValue);
                }
                else {
                    fields.push(`${dbField} = ?`);
                    if (key === 'inkLevels' || key === 'lowInkColors') {
                        values.push(JSON.stringify(value));
                    } else {
                        values.push(value);
                    }
                }
            }
        });

        if (fields.length === 0) return false;

        fields.push('updated_at = NOW()');
        values.push(agentId, normalizedName);

        await pool.execute(
            `UPDATE agent_printers SET ${fields.join(', ')} 
         WHERE agent_id = ? AND name = ?`,
            values
        );
        return true;
    },

    async savePrintEvent(agentId, printerName, pages, isColor = false) {
        const normalizedName = this.normalizePrinterName(printerName);
        const today = new Date().toISOString().split('T')[0];

        console.log(`💾 Saving print event: ${agentId} - ${normalizedName} - ${pages} pages (original: ${printerName})`);

        if (isColor) {
            await pool.execute(`
                UPDATE agent_printers 
                SET pages_today = pages_today + ?,
                    total_pages = total_pages + ?,
                    color_pages_today = color_pages_today + ?,
                    color_pages_total = color_pages_total + ?,
                    last_print_time = NOW(),
                    updated_at = NOW()
                WHERE agent_id = ? AND name = ?
            `, [pages, pages, pages, pages, agentId, normalizedName]);
        } else {
            await pool.execute(`
                UPDATE agent_printers 
                SET pages_today = pages_today + ?,
                    total_pages = total_pages + ?,
                    bw_pages_today = bw_pages_today + ?,
                    bw_pages_total = bw_pages_total + ?,
                    last_print_time = NOW(),
                    updated_at = NOW()
                WHERE agent_id = ? AND name = ?
            `, [pages, pages, pages, pages, agentId, normalizedName]);
        }

        await pool.execute(`
            INSERT INTO print_history (agent_id, printer_name, pages, color, print_date, printed_at)
            VALUES (?, ?, ?, ?, ?, NOW())
            ON DUPLICATE KEY UPDATE pages = pages + VALUES(pages)
        `, [agentId, normalizedName, pages, isColor ? 1 : 0, today]);

        await pool.execute(`
            INSERT INTO daily_reports (agent_id, report_date, total_pages, printer_count)
            VALUES (?, ?, ?, 1)
            ON DUPLICATE KEY UPDATE total_pages = total_pages + VALUES(total_pages)
        `, [agentId, today, pages]);

        console.log(`Print event saved for ${normalizedName}`);
    },

    async getDailyPrintData(agentId = null, date = null) {
        const targetDate = date || new Date().toISOString().split('T')[0];

        if (agentId) {
            const [rows] = await pool.execute(`
                SELECT 
                    printer_name,
                    SUM(pages) as total_pages,
                    SUM(CASE WHEN color = 1 THEN pages ELSE 0 END) as color_pages,
                    SUM(CASE WHEN color = 0 THEN pages ELSE 0 END) as bw_pages,
                    COUNT(*) as print_count
                FROM print_history
                WHERE agent_id = ? AND print_date = ?
                GROUP BY printer_name
                ORDER BY printer_name
            `, [agentId, targetDate]);

            const totalPages = rows.reduce((sum, r) => sum + (r.total_pages || 0), 0);

            return {
                date: targetDate,
                agentId,
                totalPages,
                printers: rows.map(r => ({
                    name: r.printer_name,
                    pages: r.total_pages,
                    colorPages: r.color_pages || 0,
                    bwPages: r.bw_pages || 0,
                    printCount: r.print_count || 0
                }))
            };
        } else {
            // Untuk semua agent
            const [rows] = await pool.execute(`
                SELECT 
                    agent_id, 
                    printer_name, 
                    SUM(pages) as total_pages,
                    SUM(CASE WHEN color = 1 THEN pages ELSE 0 END) as color_pages,
                    SUM(CASE WHEN color = 0 THEN pages ELSE 0 END) as bw_pages,
                    COUNT(*) as print_count
                FROM print_history
                WHERE print_date = ?
                GROUP BY agent_id, printer_name
                ORDER BY agent_id, printer_name
            `, [targetDate]);

            const totalPages = rows.reduce((sum, r) => sum + (r.total_pages || 0), 0);

            return {
                date: targetDate,
                totalPages,
                printers: rows.map(r => ({
                    name: r.printer_name,
                    pages: r.total_pages,
                    colorPages: r.color_pages || 0,
                    bwPages: r.bw_pages || 0,
                    printCount: r.print_count || 0,
                    agentId: r.agent_id
                }))
            };
        }
    },

    async getPrintStatistics(startDate = null, endDate = null) {
        let sql = `
            SELECT 
                DATE(printed_at) as print_date,
                COUNT(*) as total_prints,
                SUM(pages) as total_pages,
                SUM(CASE WHEN color = 1 THEN pages ELSE 0 END) as color_pages,
                SUM(CASE WHEN color = 0 THEN pages ELSE 0 END) as bw_pages,
                COUNT(DISTINCT agent_id) as unique_agents,
                COUNT(DISTINCT printer_name) as unique_printers
            FROM print_history
        `;
        const params = [];

        if (startDate && endDate) {
            sql += ' WHERE DATE(printed_at) BETWEEN ? AND ?';
            params.push(startDate, endDate);
        } else {
            sql += ' WHERE DATE(printed_at) >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)';
        }

        sql += ' GROUP BY DATE(printed_at) ORDER BY print_date DESC';
        const [rows] = await pool.execute(sql, params);
        return rows;
    },

    parsePrinterRow(row) {
        let inkLevels = {};
        try {
            inkLevels = row.ink_levels ? JSON.parse(row.ink_levels) : {};
        } catch {
            console.warn(`⚠️ Invalid ink_levels JSON for printer ${row.name}, using empty object`);
            inkLevels = {};
        }

        let lowInkColors = [];
        try {
            lowInkColors = row.low_ink_colors ? JSON.parse(row.low_ink_colors) : [];
        } catch {
            lowInkColors = [];
        }

        return {
            id: row.id,
            name: row.name,
            displayName: row.display_name,
            ipAddress: row.ip_address,
            status: row.status,
            printerStatusDetail: row.printer_status_detail || 'unknown',
            inkLevels,
            lowInkColors,
            pagesToday: row.pages_today || 0,
            totalPages: row.total_pages || 0,
            colorPagesToday: row.color_pages_today || 0,
            bwPagesToday: row.bw_pages_today || 0,
            colorPagesTotal: row.color_pages_total || 0,
            bwPagesTotal: row.bw_pages_total || 0,
            lastPrintTime: row.last_print_time,
            vendor: row.vendor || 'Unknown',
            isNetwork: row.is_network === 1,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            lastStatusChange: row.last_status_change
        };
    }
};