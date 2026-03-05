import { pool } from "../config/database.js";
import { v4 as uuidv4 } from "uuid";

export const CompanyModel = {

    async getCompany(companyId) {
        const [rows] = await pool.execute(
            "SELECT * FROM company WHERE id = ?",
            [companyId]
        );
        return rows[0];
    },

    async getAllCompanies() {
        const [rows] = await pool.execute(
            `SELECT c.*, 
                    COUNT(d.id) as department_count,
                    COUNT(a.id) as agent_count
             FROM company c
             LEFT JOIN departement d ON c.id = d.company_id
             LEFT JOIN agents a ON d.id = a.departement_id
             GROUP BY c.id
             ORDER BY c.name`
        );
        return rows;
    },

    async createCompany(companyData) {
        const { name, address, email, phone, website } = companyData;
        const id = uuidv4();
        
        const [result] = await pool.execute(
            `INSERT INTO company (id, name, address, email, phone, website)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [id, name, address || '', email || '', phone || '', website || '']
        );
        
        return { id, ...companyData };
    },

    async updateCompany(companyId, companyData) {
        const { name, address, email, phone, website } = companyData;
        
        const [result] = await pool.execute(
            `UPDATE company 
             SET name = ?, address = ?, email = ?, phone = ?, website = ?
             WHERE id = ?`,
            [name, address, email, phone, website, companyId]
        );
        
        return result.affectedRows > 0;
    },

    async deleteCompany(companyId) {
        await pool.execute("DELETE FROM departement WHERE company_id = ?", [companyId]);
        
        const [result] = await pool.execute(
            "DELETE FROM company WHERE id = ?",
            [companyId]
        );
        
        return result.affectedRows > 0;
    }
};