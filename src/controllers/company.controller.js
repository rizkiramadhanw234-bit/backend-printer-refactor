import { CompanyModel } from "../models/company.model.js";

export const companyController = {

    // GET all companies
    async getAllCompanies(req, res) {
        try {
            const companies = await CompanyModel.getAllCompanies();

            res.json({
                success: true,
                count: companies.length,
                data: companies
            });
        } catch (error) {
            console.error("Error getting companies:", error);
            res.status(500).json({
                success: false,
                error: "Internal server error"
            });
        }
    },

    // GET single company
    async getCompany(req, res) {
        try {
            const { companyId } = req.params;
            const company = await CompanyModel.getCompany(companyId);

            if (!company) {
                return res.status(404).json({
                    success: false,
                    error: "Company not found"
                });
            }

            res.json({
                success: true,
                data: company
            });
        } catch (error) {
            console.error("Error getting company:", error);
            res.status(500).json({
                success: false,
                error: "Internal server error"
            });
        }
    },

    // POST create new company
    async createCompany(req, res) {
        try {
            const { name, address, email, phone, website } = req.body;

            // Validasi
            if (!name) {
                return res.status(400).json({
                    success: false,
                    error: "Company name is required"
                });
            }

            const company = await CompanyModel.createCompany({
                name, address, email, phone, website
            });

            res.status(201).json({
                success: true,
                message: "Company created successfully",
                data: company
            });

        } catch (error) {
            console.error("Error creating company:", error);

            if (error.code === "ER_DUP_ENTRY") {
                return res.status(409).json({
                    success: false,
                    error: "Company with this name already exists"
                });
            }

            res.status(500).json({
                success: false,
                error: "Internal server error"
            });
        }
    },

    // PUT update company
    async updateCompany(req, res) {
        try {
            const { companyId } = req.params;
            const { name, address, email, phone, website } = req.body;

            const success = await CompanyModel.updateCompany(companyId, {
                name, address, email, phone, website
            });

            if (!success) {
                return res.status(404).json({
                    success: false,
                    error: "Company not found"
                });
            }

            res.json({
                success: true,
                message: "Company updated successfully",
                data: {
                    id: companyId,
                    name,
                    address,
                    email,
                    phone,
                    website
                }
            });

        } catch (error) {
            console.error("Error updating company:", error);
            res.status(500).json({
                success: false,
                error: "Internal server error"
            });
        }
    },

    // DELETE company
    async deleteCompany(req, res) {
        try {
            const { companyId } = req.params;

            const success = await CompanyModel.deleteCompany(companyId);

            if (!success) {
                return res.status(404).json({
                    success: false,
                    error: "Company not found"
                });
            }

            res.json({
                success: true,
                message: "Company deleted successfully"
            });

        } catch (error) {
            console.error("Error deleting company:", error);
            res.status(500).json({
                success: false,
                error: "Internal server error"
            });
        }
    }
};