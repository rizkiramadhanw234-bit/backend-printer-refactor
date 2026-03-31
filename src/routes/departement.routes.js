import express from "express";
import { DepartementModel } from "../models/departement.model.js";
const router = express.Router();

// PUBLIC ROUTE: Get departements by company ID (for agent registration)
router.get("/:companyId", async (req, res) => {
    try {
        const { companyId } = req.params;
        console.log("Getting departements for company:", companyId);

        if (!companyId) {
            return res.status(400).json({
                success: false,
                error: "companyId is required"
            });
        }

        // Use DepartementModel instead of controller function
        const departements = await DepartementModel.getDepartementsByCompany(companyId);

        if (!departements || departements.length === 0) {
            return res.status(404).json({
                success: false,
                error: "No departements found for this company"
            });
        }

        res.json({
            success: true,
            data: departements,
        });

    } catch (error) {
        console.error("Error getting departements:", error);
        res.status(500).json({
            success: false,
            error: "Internal server error"
        });
    }
});

export default router;