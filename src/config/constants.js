export const WEBSOCKET_TYPES = {
  AGENT: {
    REGISTER: 'device_register',
    PRINTER_UPDATE: 'printer_update',
    PRINTER_STATUS: 'printer_status',
    INK_STATUS: 'ink_status',
    PRINT_EVENT: 'print_event',
    DAILY_REPORT: 'daily_report',
    HEARTBEAT: 'heartbeat',
    COMMAND_RESPONSE: 'command_response',
    CONNECTION_ACK: 'connection_ack'
  },
  DASHBOARD: {
    INITIAL_DATA: 'initial_data',
    AGENT_CONNECTED: 'agent_connected',
    AGENT_DISCONNECTED: 'agent_disconnected',
    PRINTER_UPDATE: 'printer_update',
    INK_UPDATE: 'ink_update',
    ALERT: 'alert',
    PING: 'ping',
    PONG: 'pong'
  }
};

export const PRINTER_STATUS = {
  // Windows raw status mapping
  WINDOWS: {
    1: 'other',
    2: 'unknown',
    3: 'ready',
    4: 'printing',
    5: 'warming_up',
    6: 'paused',
    7: 'offline'
  },
  // Error state mapping
  ERROR: {
    'NoError': 'ready',
    'PaperJam': 'paper_jam',
    'OutOfPaper': 'out_of_paper',
    'DoorOpen': 'door_open',
    'TonerLow': 'low_ink',
    'NoToner': 'no_ink',
    'DeveloperLow': 'low_ink',
    'MarkerSupplyLow': 'low_ink',
    'MarkerSupplyEmpty': 'no_ink',
    'Offline': 'offline',
    'UserIntervention': 'paused'
  },
  // Standardized status for database
  DETAILED: [
    'ready', 'printing', 'offline', 'paused',
    'paper_jam', 'out_of_paper', 'door_open',
    'low_ink', 'no_ink', 'error_other', 'unknown'
  ]
};

export const AGENT_STATUS = {
  ONLINE: 'online',
  OFFLINE: 'offline',
  PENDING: 'pending',
  ERROR: 'error',
  BLOCKED: 'blocked'
};