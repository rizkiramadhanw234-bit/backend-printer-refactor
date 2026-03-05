import { pool } from "../config/database.js";

export const UserModel = {
    async findByEmail(email) {
        const [rows] = await pool.execute(
            "SELECT * FROM users WHERE email = ? LIMIT 1",
            [email]
        );
        return rows[0];
    },

    async createAdmin(email, hashedPassword) {
        const [result] = await pool.execute(
            "INSERT INTO users (email, password, role) VALUES (?, ?, 'admin')",
            [email, hashedPassword]
        );
        return result.insertId;
    },

    async getAllAdmins() {
        const [rows] = await pool.execute(
            "SELECT id, email, role, created_at FROM users WHERE role = 'admin'"
        );
        return rows;
    }
};