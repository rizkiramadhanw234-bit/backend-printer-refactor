export function transformAgentForFrontend(agentData) {
  if (!agentData) return null;

  return {
    id: agentData.agentId,
    name: agentData.name || agentData.agentId,
    company: agentData.company_name || "PT. Kudukuats",
    department: agentData.department_name || "IT Department",
    status: agentData.status || "offline",
    lastSeen: agentData.last_seen,
    connectedAt: agentData.registered_at,
    hostname: agentData.hostname,
    platform: agentData.platform,
    printerCount: agentData.printer_count || 0,
    printersOnline: agentData.printers_online || 0,
    totalPagesToday: agentData.pages_today || 0,
    isOnline: agentData.status === 'online'
  };
}

export function transformPrinterForFrontend(printer, agentId, agentConfig) {
  if (!printer) return null;

  return {
    name: printer.name,
    displayName: extractDisplayName(printer.name),
    status: mapPrinterStatus(printer.status),
    detailedStatus: printer.printer_status_detail,
    inkLevels: printer.ink_levels || {},
    lowInkColors: printer.low_ink_colors || [],
    pagesToday: printer.pages_today || 0,
    totalPages: printer.total_pages || 0,
    colorPagesToday: printer.color_pages_today || 0,
    bwPagesToday: printer.bw_pages_today || 0,
    colorPagesTotal: printer.color_pages_total || 0,
    bwPagesTotal: printer.bw_pages_total || 0,
    lastPrintTime: printer.last_print_time,
    ipAddress: printer.ip_address,
    isNetworkPrinter: printer.is_network === 1,
    vendor: printer.vendor || "Unknown",
    company: agentConfig?.company,
    department: agentConfig?.department,
    agentId: agentId
  };
}

export function extractDisplayName(fullName) {
  try {
    const match = fullName.match(/\((.*?)\)/);
    if (match) {
      const model = match[1];
      const vendorMatch = model.match(/(HP|Canon|Epson|Brother|Xerox|Kyocera|Ricoh)/i);
      const modelMatch = model.match(/(M?\d+[a-z]*)/i);

      if (vendorMatch && modelMatch) {
        return `${vendorMatch[0]} ${modelMatch[0]}`;
      }
      return model;
    }
    return fullName;
  } catch {
    return fullName;
  }
}

export function mapPrinterStatus(status) {
  if (typeof status === 'string') {
    status = status.toLowerCase();
    if (status.includes('ready')) return 'ready';
    if (status.includes('print')) return 'printing';
    if (status.includes('pause')) return 'paused';
    if (status.includes('error')) return 'error';
    if (status.includes('offline')) return 'offline';
    return status;
  }

  const statusMap = {
    0: "pending",
    1: "paused",
    2: "error",
    3: "ready",
    4: "printing",
    5: "offline",
    6: "paper_jam",
    7: "out_of_paper",
    8: "low_ink",
    9: "no_ink",
    10: "door_open"
  };

  return statusMap[status] || "unknown";
}

export function calculateUptime(connectedAt) {
  if (!connectedAt) return "N/A";

  const connected = new Date(connectedAt);
  const now = new Date();
  const diffMs = now - connected;

  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}