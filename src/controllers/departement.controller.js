import { DepartementModel } from "../models/departement.model.js";

export const departementController = {

    // GET departements by company
    async getDepartementsByCompany(req, res) {
        try {
            const { companyId } = req.params;
            const departements = await DepartementModel.getDepartementsByCompany(companyId);

            res.json({
                success: true,
                count: departements.length,
                data: departements
            });
        } catch (error) {
            console.error("Error getting departements by company:", error);
            res.status(500).json({
                success: false,
                error: "Internal server error"
            });
        }
    },

    // POST create new departement
    async createDepartement(req, res) {
        try {
            const { companyId } = req.params;
            const { name } = req.body;

            if (!name) {
                return res.status(400).json({
                    success: false,
                    error: "Departement name is required"
                });
            }

            const departement = await DepartementModel.createDepartement(companyId, name);

            res.status(201).json({
                success: true,
                message: "Departement created successfully",
                data: departement
            });
        } catch (error) {
            console.error("Error creating departement:", error);
            res.status(500).json({
                success: false,
                error: "Internal server error"
            });
        }
    },

    // PUT update departement
    async updateDepartement(req, res) {
        try {
            const { departementId } = req.params;
            const { name } = req.body;

            if (!name) {
                return res.status(400).json({
                    success: false,
                    error: "Departement name is required"
                });
            }

            const success = await DepartementModel.updateDepartement(departementId, name);

            if (!success) {
                return res.status(404).json({
                    success: false,
                    error: "Departement not found"
                });
            }

            res.json({
                success: true,
                message: "Departement updated successfully",
                data: { id: departementId, name }
            });
        } catch (error) {
            console.error("Error updating departement:", error);
            res.status(500).json({
                success: false,
                error: "Internal server error"
            });
        }
    },

    // DELETE departement
    async deleteDepartement(req, res) {
        try {
            const { departementId } = req.params;

            const success = await DepartementModel.deleteDepartement(departementId);

            if (!success) {
                return res.status(404).json({
                    success: false,
                    error: "Departement not found"
                });
            }

            res.json({
                success: true,
                message: "Departement deleted successfully"
            });
        } catch (error) {
            console.error("Error deleting departement:", error);
            res.status(500).json({
                success: false,
                error: "Internal server error"
            });
        }
    }
};