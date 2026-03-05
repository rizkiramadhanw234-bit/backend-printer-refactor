import { AgentModel } from '../models/agent.model.js';
import { PrinterModel } from '../models/PrinterModel.js';
import { connectionManager } from './websocket/connection.manager.js';
import { logger } from '../utils/logger.js';
import crypto from 'crypto';

export class AgentService {
  
  /**
   * Register a new agent or update existing one
   */
  async registerAgent(agentData, ipAddress) {
    const { 
      hostname, macAddress, contactPerson, platform = 'windows',
      departmentId, customAgentId, apiKey, agentToken 
    } = agentData;

    // Generate IDs if not provided
    const finalAgentId = customAgentId || this.generateAgentId();
    const finalApiKey = apiKey || this.generateApiKey();
    const finalAgentToken = agentToken || this.generateAgentToken();

    // Check if agent already exists by MAC
    const existingAgent = await AgentModel.findByMacAddress(macAddress);

    if (existingAgent) {
      // Update existing agent
      await AgentModel.update(existingAgent.id, {
        status: 'online',
        hostname,
        api_key: finalApiKey,
        agent_token: finalAgentToken,
        platform,
        departement_id: departmentId,
        ip_address: ipAddress,
        contact_person: contactPerson,
        last_seen: new Date()
      });

      logger.info(`✅ Agent updated: ${existingAgent.id}`);
      
      return {
        agentId: existingAgent.id,
        apiKey: finalApiKey,
        agentToken: finalAgentToken,
        isNew: false
      };
    } else {
      // Create new agent
      await AgentModel.create({
        id: finalAgentId,
        departement_id: departmentId || 1,
        name: hostname,
        contact_person: contactPerson,
        hostname,
        ip_address: ipAddress,
        mac_address: macAddress,
        platform,
        api_key: finalApiKey,
        agent_token: finalAgentToken
      });

      logger.info(`✅ New agent created: ${finalAgentId}`);
      
      return {
        agentId: finalAgentId,
        apiKey: finalApiKey,
        agentToken: finalAgentToken,
        isNew: true
      };
    }
  }

  /**
   * Process agent heartbeat
   */
  async processHeartbeat(agentId, systemData) {
    // Update last seen
    await AgentModel.updateStatus(agentId, 'online');

    // Save heartbeat data if provided
    if (systemData && Object.keys(systemData).length > 0) {
      const printers = await PrinterModel.findByAgent(agentId);
      
      await AgentModel.saveHeartbeat(agentId, {
        cpuUsage: systemData.cpu_usage,
        memoryUsage: systemData.memory_usage,
        printerCount: printers.length,
        activePrinters: printers.filter(p => p.status === 'printing').length,
        lastPrintMinutes: this.calculateLastPrintMinutes(printers)
      });
    }

    // Check if agent is connected via WebSocket
    const isConnected = connectionManager.hasAgent(agentId);
    
    return {
      agentId,
      lastSeen: new Date().toISOString(),
      websocketConnected: isConnected
    };
  }

  /**
   * Get agent dashboard data (for agent login)
   */
  async getAgentDashboard(agentId) {
    const agent = await AgentModel.findById(agentId);
    if (!agent) return null;

    const printers = await PrinterModel.findByAgent(agentId);
    
    // Calculate statistics
    const stats = {
      totalPrinters: printers.length,
      printersOnline: printers.filter(p => p.status === 'ready' || p.status === 'printing').length,
      printersOffline: printers.filter(p => p.status === 'offline').length,
      printersWithLowInk: printers.filter(p => p.lowInkColors?.length > 0).length,
      totalPagesToday: printers.reduce((sum, p) => sum + (p.pagesToday || 0), 0),
      totalPages: printers.reduce((sum, p) => sum + (p.totalPages || 0), 0),
      colorPagesToday: printers.reduce((sum, p) => sum + (p.colorPagesToday || 0), 0),
      bwPagesToday: printers.reduce((sum, p) => sum + (p.bwPagesToday || 0), 0)
    };

    return {
      agent: {
        id: agent.id,
        name: agent.name,
        company: agent.company_name,
        department: agent.department_name,
        contactPerson: agent.contact_person,
        hostname: agent.hostname,
        platform: agent.platform,
        status: agent.status,
        lastSeen: agent.last_seen,
        registeredAt: agent.registered_at
      },
      statistics: stats,
      printers: printers.map(p => ({
        name: p.name,
        displayName: p.displayName,
        status: p.status,
        detailedStatus: p.printerStatusDetail,
        inkLevels: p.inkLevels,
        lowInkColors: p.lowInkColors,
        pagesToday: p.pagesToday,
        totalPages: p.totalPages,
        colorPagesToday: p.colorPagesToday,
        bwPagesToday: p.bwPagesToday,
        lastPrintTime: p.lastPrintTime,
        ipAddress: p.ipAddress,
        vendor: p.vendor,
        isNetwork: p.isNetwork
      }))
    };
  }

  /**
   * Validate agent credentials
   */
  async validateCredentials(agentId, apiKey) {
    const agent = await AgentModel.findByApiKey(apiKey);
    
    if (!agent || agent.id !== agentId) {
      return { valid: false, error: 'Invalid agent ID or API key' };
    }

    if (agent.status === 'blocked') {
      return { valid: false, error: `Agent is blocked: ${agent.blocked_reason || 'No reason'}` };
    }

    if (agent.status === 'pending') {
      return { valid: false, error: 'Agent registration is pending approval' };
    }

    return { 
      valid: true, 
      agent: {
        id: agent.id,
        name: agent.name,
        status: agent.status
      }
    };
  }

  /**
   * Rotate agent token (for security)
   */
  async rotateAgentToken(agentId) {
    const newToken = this.generateAgentToken();
    
    await AgentModel.update(agentId, {
      agent_token: newToken,
      token_rotated_at: new Date()
    });

    return newToken;
  }

  /**
   * Get agent connection status
   */
  getConnectionStatus(agentId) {
    return {
      agentId,
      websocketConnected: connectionManager.hasAgent(agentId),
      lastSeen: null, // Will be filled from DB if needed
      dashboardConnected: false // For future use
    };
  }

  /**
   * Send command to agent via WebSocket
   */
  async sendCommand(agentId, command, data = {}) {
    const ws = connectionManager.getAgent(agentId);
    
    if (!ws) {
      return { 
        success: false, 
        error: 'Agent is not connected via WebSocket' 
      };
    }

    const commandId = `cmd_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    
    const message = {
      type: 'command',
      commandId,
      action: command,
      data,
      timestamp: new Date().toISOString()
    };

    ws.send(JSON.stringify(message));

    return {
      success: true,
      commandId,
      sent: true
    };
  }

  // ==================== PRIVATE HELPERS ====================

  generateAgentId() {
    return `AGENT_${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
  }

  generateApiKey() {
    return crypto.randomBytes(32).toString('hex');
  }

  generateAgentToken() {
    return crypto.randomBytes(48).toString('hex');
  }

  calculateLastPrintMinutes(printers) {
    let mostRecent = null;
    
    printers.forEach(printer => {
      if (printer.lastPrintTime) {
        const printTime = new Date(printer.lastPrintTime).getTime();
        if (!mostRecent || printTime > mostRecent) {
          mostRecent = printTime;
        }
      }
    });

    if (!mostRecent) return null;
    
    return Math.floor((Date.now() - mostRecent) / (1000 * 60));
  }

  /**
   * Clean up offline agents (called by cron)
   */
  async cleanupOfflineAgents(timeoutMinutes = 5) {
    const cutoffTime = new Date();
    cutoffTime.setMinutes(cutoffTime.getMinutes() - timeoutMinutes);

    // Find agents with last_seen older than cutoff
    const offlineAgents = await AgentModel.findOffline(cutoffTime);
    
    for (const agent of offlineAgents) {
      await AgentModel.updateStatus(agent.id, 'offline');
      
      // Remove from WebSocket connections if still there
      if (connectionManager.hasAgent(agent.id)) {
        connectionManager.removeAgent(agent.id);
      }

      logger.info(`🧹 Cleaned up offline agent: ${agent.id}`);
    }

    return offlineAgents.length;
  }
}

// Export singleton instance
export const agentService = new AgentService();