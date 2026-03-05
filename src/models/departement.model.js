import { pool } from "../config/database.js";

export const DepartementModel = {

    async getDepartement(departementId) {
        const [rows] = await pool.execute(
            "SELECT * FROM departement WHERE id = ?",
            [departementId]
        );
        return rows[0];
    },

    async getDepartementsByCompany(companyId) {
        const [rows] = await pool.execute(
            `SELECT d.*, 
                    COUNT(a.id) as agent_count
             FROM departement d
             LEFT JOIN agents a ON d.id = a.departement_id
             WHERE d.company_id = ?
             GROUP BY d.id
             ORDER BY d.name`,
            [companyId]
        );
        return rows;
    },

    async createDepartement(companyId, name) {
        const [result] = await pool.execute(
            `INSERT INTO departement (company_id, name)
             VALUES (?, ?)`,
            [companyId, name]
        );
        
        return { id: result.insertId, company_id: companyId, name };
    },

    async updateDepartement(departementId, name) {
        const [result] = await pool.execute(
            "UPDATE departement SET name = ? WHERE id = ?",
            [name, departementId]
        );
        
        return result.affectedRows > 0;
    },

    async deleteDepartement(departementId) {
        const [result] = await pool.execute(
            "DELETE FROM departement WHERE id = ?",
            [departementId]
        );
        
        return result.affectedRows > 0;
    }
};