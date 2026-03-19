import { pool } from '../config/database.js';

export const AgentModel = {
    async findById(agentId) {
        const [agents] = await pool.execute(
            `SELECT a.*, 
        d.name as department_name,
        c.name as company_name
       FROM agents a
       LEFT JOIN departement d ON a.departement_id = d.id
       LEFT JOIN company c ON d.company_id = c.id
       WHERE a.id = ?`,
            [agentId]
        );
        return agents[0];
    },

    async findByApiKey(apiKey) {
        const [agents] = await pool.execute(
            'SELECT * FROM agents WHERE api_key = ? AND is_active = 1',
            [apiKey]
        );
        return agents[0];
    },

    async findByToken(token) {
        const [agents] = await pool.execute(
            'SELECT * FROM agents WHERE agent_token = ? AND is_active = 1',
            [token]
        );
        return agents[0];
    },

    async findByIdAndUpdateToken(agentId, newToken) {
        const [agents] = await pool.execute(
            'SELECT * FROM agents WHERE id = ?',
            [agentId]
        );

        if (agents.length === 0) return null;

        await pool.execute(
            'UPDATE agents SET agent_token = ?, updated_at = NOW() WHERE id = ?',
            [newToken, agentId]
        );

        agents[0].agent_token = newToken;
        return agents[0];
    },

    async create(data) {
        const { id, departement_id, name, contact_person, hostname,
            ip_address, mac_address, platform, api_key, agent_token } = data;

        await pool.execute(
            `INSERT INTO agents 
       (id, departement_id, name, contact_person, hostname, ip_address, 
        mac_address, platform, status, api_key, agent_token, registered_at, last_seen)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'online', ?, ?, NOW(), NOW())`,
            [id, departement_id, name, contact_person, hostname, ip_address,
                mac_address, platform, api_key, agent_token]
        );
        return id;
    },

    async update(agentId, data) {
        const fields = [];
        const values = [];

        Object.entries(data).forEach(([key, value]) => {
            if (value !== undefined) {
                fields.push(`${key} = ?`);
                values.push(value);
            }
        });

        if (fields.length === 0) return false;

        values.push(agentId);
        await pool.execute(
            `UPDATE agents SET ${fields.join(', ')}, updated_at = NOW() WHERE id = ?`,
            values
        );
        return true;
    },

    async updateStatus(agentId, status) {
        await pool.execute(
            'UPDATE agents SET status = ?, last_seen = NOW() WHERE id = ?',
            [status, agentId]
        );
    },

    async getAll(filters = {}) {
        let sql = `
      SELECT a.id, a.name, a.hostname, a.ip_address, a.platform, 
             a.status, a.last_seen, a.registered_at,
             d.name as department_name,
             c.name as company_name,
             (SELECT COUNT(*) FROM agent_printers WHERE agent_id = a.id) as printer_count
      FROM agents a
      LEFT JOIN departement d ON a.departement_id = d.id
      LEFT JOIN company c ON d.company_id = c.id
      WHERE 1=1
    `;
        const values = [];

        if (filters.status) {
            sql += ' AND a.status = ?';
            values.push(filters.status);
        }
        if (filters.departmentId) {
            sql += ' AND a.departement_id = ?';
            values.push(filters.departmentId);
        }

        sql += ' ORDER BY a.last_seen DESC';
        const [rows] = await pool.execute(sql, values);
        return rows;
    },

    async getByDepartment(departmentId) {
        const [rows] = await pool.execute(
            `SELECT id, name, hostname, platform, status, last_seen, registered_at,
              (SELECT COUNT(*) FROM agent_printers WHERE agent_id = id) as printer_count
       FROM agents WHERE departement_id = ? ORDER BY last_seen DESC`,
            [departmentId]
        );
        return rows;
    },

    async saveConnection(agentId, connectionInfo) {
        await pool.execute(
            `INSERT INTO agent_connections 
       (agent_id, connection_type, ip_address, user_agent, connected_at, status)
       VALUES (?, ?, ?, ?, NOW(), 'success')`,
            [agentId, connectionInfo.type || 'websocket',
                connectionInfo.ip || 'unknown', connectionInfo.userAgent || '']
        );
    },

    async closeConnection(agentId) {
        await pool.execute(
            `UPDATE agent_connections 
       SET disconnected_at = NOW(), 
           duration_seconds = TIMESTAMPDIFF(SECOND, connected_at, NOW()),
           status = 'timeout'
       WHERE agent_id = ? AND disconnected_at IS NULL
       ORDER BY connected_at DESC LIMIT 1`,
            [agentId]
        );
    },

    async saveHeartbeat(agentId, systemData) {
        await pool.execute(
            `INSERT INTO agent_heartbeats 
       (agent_id, cpu_usage, memory_usage, printer_count, active_printers, last_print_minutes)
       VALUES (?, ?, ?, ?, ?, ?)`,
            [
                agentId,
                systemData.cpuUsage || 0,
                systemData.memoryUsage || 0,
                systemData.printerCount || 0,
                systemData.activePrinters || 0,
                systemData.lastPrintMinutes || null
            ]
        );
    },

    async getStatistics() {
        const [stats] = await pool.execute(`
      SELECT 
        COUNT(*) as total_agents,
        SUM(CASE WHEN status = 'online' THEN 1 ELSE 0 END) as online_agents,
        SUM(CASE WHEN status = 'offline' THEN 1 ELSE 0 END) as offline_agents,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_agents,
        (SELECT COUNT(DISTINCT agent_id) FROM agent_printers) as agents_with_printers,
        (SELECT COUNT(*) FROM agent_printers) as total_printers,
        (SELECT COUNT(*) FROM agent_printers WHERE status = 'printing') as active_printers,
        (SELECT COUNT(*) FROM agent_printers WHERE status IN ('error', 'offline')) as problem_printers
      FROM agents
    `);
        return stats[0] || {};
    },

    async delete(agentId) {
        await pool.execute('DELETE FROM agents WHERE id = ?', [agentId]);
        return true;
    },
};