class ConnectionManager {
  constructor() {
    this.agents = new Map();      
    this.dashboards = new Set(); 
  }

  addAgent(agentId, ws) {
    this.agents.set(agentId, ws);
    console.log(`Agent ${agentId} connected. Total agents: ${this.agents.size}`);
  }

  removeAgent(agentId) {
    this.agents.delete(agentId);
    console.log(`Agent ${agentId} disconnected. Total agents: ${this.agents.size}`);
  }

  getAgent(agentId) {
    return this.agents.get(agentId);
  }

  hasAgent(agentId) {
    return this.agents.has(agentId);
  }

  sendToAgent(agentId, message) {
    const ws = this.agents.get(agentId);
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify(message));
      return true;
    }
    return false;
  }

  addDashboard(ws) {
    this.dashboards.add(ws);
    console.log(`Dashboard connected. Total dashboards: ${this.dashboards.size}`);
  }

  removeDashboard(ws) {
    this.dashboards.delete(ws);
    console.log(`Dashboard disconnected. Total dashboards: ${this.dashboards.size}`);
  }

  broadcastToDashboards(data) {
    const message = JSON.stringify(data);
    let sent = 0;
    this.dashboards.forEach(ws => {
      if (ws.readyState === 1) {
        ws.send(message);
        sent++;
      }
    });
    return sent;
  }

  getStats() {
    return {
      agents: this.agents.size,
      dashboards: this.dashboards.size
    };
  }

  getAgentIds() {
    return Array.from(this.agents.keys());
  }
}

export const connectionManager = new ConnectionManager();