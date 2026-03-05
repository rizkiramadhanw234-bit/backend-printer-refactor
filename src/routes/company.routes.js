import express from "express";
import { pool } from "../config/database.js";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { companyController } from "../controllers/company.controller.js";
import { departementController } from "../controllers/departement.controller.js";
import { DepartementModel } from "../models/departement.model.js";

const router = express.Router();

//  PUBLIC ROUTES (NO AUTH) 

// POST verify company license (for agent registration)
router.post("/verify", async (req, res) => {
    try {
        const { licenseKey } = req.body;
        if (!licenseKey) {
            return res.status(400).json({
                success: false,
                error: "License key is required"
            });
        }
        
        // Cek company exists
        const [companies] = await pool.execute(
            "SELECT * FROM company WHERE id = ? LIMIT 1",
            [licenseKey]
        );
        
        if (companies.length === 0) {
            return res.status(401).json({
                success: false,
                error: "Invalid license key"
            });
        }

        const company = companies[0];
        
        // Get departements using model
        const departements = await DepartementModel.getDepartementsByCompany(company.id);

        res.json({
            success: true,
            data: { company, departements },
        });

    } catch (error) {
        console.error("Error verifying company:", error);
        res.status(500).json({
            success: false,
            error: "Internal server error"
        });
    }
});

//  ADMIN ROUTES 

// GET all companies (admin only)
router.get("/", authMiddleware, companyController.getAllCompanies);

// GET single company (admin only)
router.get("/:companyId", authMiddleware, companyController.getCompany);

// POST create company (admin only)
router.post("/", authMiddleware, companyController.createCompany);

// PUT update company (admin only)
router.put("/:companyId", authMiddleware, companyController.updateCompany);

// DELETE company (admin only)
router.delete("/:companyId", authMiddleware, companyController.deleteCompany);

//  DEPARTEMENT ROUTES (ADMIN ONLY) 

// GET departements by company (admin only)
router.get("/:companyId/departements", authMiddleware, departementController.getDepartementsByCompany);

// POST create departement under company (admin only)
router.post("/:companyId/departements", authMiddleware, departementController.createDepartement);

// PUT update departement (admin only)
router.put("/departements/:departementId", authMiddleware, departementController.updateDepartement);

// DELETE departement (admin only)
router.delete("/departements/:departementId", authMiddleware, departementController.deleteDepartement);

export default router;