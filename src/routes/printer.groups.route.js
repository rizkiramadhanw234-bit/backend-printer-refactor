import express from "express";
import { pool } from "../config/database.js";
import { authMiddleware } from "../middleware/auth.middleware.js";

const router = express.Router();

router.use(authMiddleware);

router.get("/", async (req, res) => {
    try {
        const [groups] = await pool.query(
            "SELECT id, name, created_at FROM printer_groups ORDER BY created_at ASC"
        );

        const [members] = await pool.query(
            "SELECT group_id, printer_id FROM printer_group_members"
        );

        const memberMap = {};
        for (const m of members) {
            if (!memberMap[m.group_id]) memberMap[m.group_id] = [];
            memberMap[m.group_id].push(m.printer_id);
        }

        const result = groups.map((g) => ({
            id: g.id,
            name: g.name,
            printerIds: memberMap[g.id] || [],
        }));

        res.json({ success: true, groups: result });
    } catch (error) {
        console.error("GET /printer-groups error:", error);
        res.status(500).json({ success: false, error: "Failed to fetch groups" });
    }
});

//  group baru
router.post("/", async (req, res) => {
    const { name } = req.body;
    if (!name?.trim()) {
        return res.status(400).json({ success: false, error: "Name is required" });
    }

    const id = `group_${Date.now()}`;

    try {
        await pool.query(
            "INSERT INTO printer_groups (id, name) VALUES (?, ?)",
            [id, name.trim()]
        );

        res.json({ success: true, group: { id, name: name.trim(), printerIds: [] } });
    } catch (error) {
        console.error("POST /printer-groups error:", error);
        res.status(500).json({ success: false, error: "Failed to create group" });
    }
});

// Rename group
router.patch("/:id", async (req, res) => {
    const { id } = req.params;
    const { name } = req.body;
    if (!name?.trim()) {
        return res.status(400).json({ success: false, error: "Name is required" });
    }

    try {
        const [result] = await pool.query(
            "UPDATE printer_groups SET name = ? WHERE id = ?",
            [name.trim(), id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, error: "Group not found" });
        }

        res.json({ success: true });
    } catch (error) {
        console.error("PATCH /printer-groups/:id error:", error);
        res.status(500).json({ success: false, error: "Failed to rename group" });
    }
});

// Hapus group otomatis CASCADE
router.delete("/:id", async (req, res) => {
    const { id } = req.params;

    try {
        const [result] = await pool.query(
            "DELETE FROM printer_groups WHERE id = ?",
            [id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, error: "Group not found" });
        }

        res.json({ success: true });
    } catch (error) {
        console.error("DELETE /printer-groups/:id error:", error);
        res.status(500).json({ success: false, error: "Failed to delete group" });
    }
});

// Assign printer ke group
// Body: { printerId: number }
router.put("/:id/members", async (req, res) => {
    const { id: groupId } = req.params;
    const { printerId } = req.body;

    if (!printerId) {
        return res.status(400).json({ success: false, error: "printerId is required" });
    }

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        await conn.query(
            "DELETE FROM printer_group_members WHERE printer_id = ?",
            [printerId]
        );

        // Assign ke group 
        await conn.query(
            "INSERT INTO printer_group_members (group_id, printer_id) VALUES (?, ?)",
            [groupId, printerId]
        );

        await conn.commit();
        res.json({ success: true });
    } catch (error) {
        await conn.rollback();
        console.error("PUT /printer-groups/:id/members error:", error);
        res.status(500).json({ success: false, error: "Failed to assign printer" });
    } finally {
        conn.release();
    }
});

// Unassign printer dari group
router.delete("/:id/members/:printerId", async (req, res) => {
    const { id: groupId, printerId } = req.params;

    try {
        await pool.query(
            "DELETE FROM printer_group_members WHERE group_id = ? AND printer_id = ?",
            [groupId, printerId]
        );

        res.json({ success: true });
    } catch (error) {
        console.error("DELETE /printer-groups/:id/members/:printerId error:", error);
        res.status(500).json({ success: false, error: "Failed to unassign printer" });
    }
});

export default router;