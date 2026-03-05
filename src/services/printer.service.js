import { PRINTER_STATUS } from '../config/constants.js';

export class PrinterService {
    constructor() {
        this.statusMap = PRINTER_STATUS;
    }

    async processPrinterUpdate(agentId, printer) {
        const printerState = printer.printerState || printer.PrinterStatus;
        const errorState = printer.detectedErrorState;
        const inkLevels = printer.inkLevels || printer.inkStatus?.levels || {};
        const statusString = printer.status;
        const workOffline = printer.workOffline === true;

        const detailedStatus = this.mapWindowsStatus(
            printerState,
            errorState,
            inkLevels,
            statusString,
            workOffline
        );

        let generalStatus = this.determineGeneralStatus(detailedStatus, printerState, statusString, workOffline);

        // Check for low ink colors
        const lowInkColors = [];
        Object.entries(inkLevels).forEach(([color, level]) => {
            if (level !== null && level < 15) {
                lowInkColors.push(color);
            }
        });

        // Prepare data for database 
        return {
            name: printer.name,
            display_name: printer.displayName || printer.name,
            ip_address: printer.ipAddress || '0.0.0.0',
            status: generalStatus,  
            printer_status_detail: detailedStatus,
            ink_levels: inkLevels,
            low_ink_colors: lowInkColors,
            pages_today: printer.todayPages || printer.pagesToday || 0,
            total_pages: printer.totalPages || 0,
            last_print_time: printer.lastPrintTime || null,
            vendor: printer.vendor || 'Unknown',
            is_network: printer.isNetwork !== undefined ? printer.isNetwork : true,
            color_pages_today: printer.colorPagesToday || 0,
            bw_pages_today: printer.bwPagesToday || 0,
            color_pages_total: printer.colorPagesTotal || 0,
            bw_pages_total: printer.bwPagesTotal || 0
        };
    }

    determineGeneralStatus(detailedStatus, printerState, statusString, workOffline) {
        if (workOffline) return 'OFFLINE';

        if (printerState !== undefined) {
            const windowsStatusMap = {
                1: 'OTHER',    
                2: 'UNKNOWN',  
                3: 'READY',    
                4: 'PRINTING', 
                5: 'WARMUP',   
                6: 'PAUSED',   
                7: 'OFFLINE',  
            };
            const mapped = windowsStatusMap[printerState];
            if (mapped) {
                if (mapped === 'READY') return 'READY';
                if (mapped === 'PRINTING') return 'PRINTING';
                if (mapped === 'OFFLINE') return 'OFFLINE';
            }
        }

        const detailedToGeneral = {
            'ready': 'READY',
            'printing': 'PRINTING',
            'offline': 'OFFLINE',
            'paused': 'PAUSED',
            'paper_jam': 'ERROR',
            'out_of_paper': 'ERROR',
            'door_open': 'ERROR',
            'low_ink': 'READY',      
            'no_ink': 'READY',        
            'error_other': 'ERROR',
            'warming_up': 'WARMUP',
            'unknown': 'UNKNOWN'
        };

        if (detailedToGeneral[detailedStatus]) {
            return detailedToGeneral[detailedStatus];
        }

        if (statusString) {
            const upper = statusString.toUpperCase();
            if (upper.includes('READY')) return 'READY';
            if (upper.includes('PRINT')) return 'PRINTING';
            if (upper.includes('OFFLINE')) return 'OFFLINE';
            if (upper.includes('PAUSE')) return 'PAUSED';
            if (upper.includes('ERROR')) return 'ERROR';
        }

        return 'UNKNOWN';
    }

    mapWindowsStatus(printerState, errorState, inkLevels, statusString, workOffline) {
        if (workOffline) return 'offline';

        if (errorState && errorState !== 'NoError') {
            const mapped = this.statusMap.ERROR[errorState];
            if (mapped) return mapped;
        }

        if (inkLevels) {
            const values = Object.values(inkLevels).filter(v => v !== null);
            if (values.length > 0) {
                if (values.some(v => v === 0)) return 'no_ink';      // ← no_ink
                if (values.some(v => v < 15)) return 'low_ink';      // ← low_ink
            }
        }

        if (printerState !== undefined) {
            const mapped = this.statusMap.WINDOWS[printerState];
            if (mapped) return mapped;
        }

        if (statusString) {
            const upper = statusString.toUpperCase();
            const statusMapFromString = {
                'READY': 'ready',
                'IDLE': 'ready',
                'PRINTING': 'printing',
                'OFFLINE': 'offline',
                'PAUSED': 'paused',
                'STOPPED': 'paused',
                'ERROR': 'error_other',
                'WARMUP': 'warming_up',
                'WARMING UP': 'warming_up',
                'PAPER JAM': 'paper_jam',
                'OUT OF PAPER': 'out_of_paper',
                'DOOR OPEN': 'door_open',
                'TONER LOW': 'low_ink',
                'LOW INK': 'low_ink',
                'NO TONER': 'no_ink',
                'NO INK': 'no_ink',
                'OTHER': 'unknown'
            };
            if (statusMapFromString[upper]) return statusMapFromString[upper];
        }

        return 'unknown';
    }

    getAlertStatus(printer) {
        const alerts = [];

        if (printer.printer_status_detail === 'paper_jam') {
            alerts.push({ type: 'paper_jam', severity: 'high' });
        }
        if (printer.printer_status_detail === 'out_of_paper') {
            alerts.push({ type: 'out_of_paper', severity: 'medium' });
        }
        if (printer.printer_status_detail === 'low_ink') {
            alerts.push({ type: 'low_ink', severity: 'low', colors: printer.low_ink_colors });
        }
        if (printer.printer_status_detail === 'no_ink') {
            alerts.push({ type: 'no_ink', severity: 'high' });
        }
        if (printer.printer_status_detail === 'offline') {
            alerts.push({ type: 'offline', severity: 'medium' });
        }

        return alerts;
    }
}