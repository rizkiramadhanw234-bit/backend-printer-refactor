import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { UserModel } from "../models/user.model.js";

export const authController = {
    async login(req, res) {
        try {
            const { email, password } = req.body;

            if (!email || !password) {
                return res.status(400).json({
                    success: false,
                    message: "Email dan password wajib diisi"
                });
            }

            const user = await UserModel.findByEmail(email);
            if (!user) {
                return res.status(401).json({
                    success: false,
                    message: "Email tidak terdaftar"
                });
            }

            const match = await bcrypt.compare(password, user.password);
            if (!match) {
                return res.status(401).json({
                    success: false,
                    message: "Password salah"
                });
            }

            const token = jwt.sign(
                {
                    id: user.id,
                    email: user.email,
                    role: user.role
                },
                process.env.JWT_SECRET || "MyVerySecretKey123",
                { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
            );

            res.json({
                success: true,
                message: "Login berhasil",
                token,
                user: {
                    id: user.id,
                    email: user.email,
                    role: user.role
                }
            });

        } catch (err) {
            console.error("Login error:", err);
            res.status(500).json({
                success: false,
                message: "Server error"
            });
        }
    },

    logout(req, res) {
        res.json({
            success: true,
            message: "Logout berhasil"
        });
    },

    check(req, res) {
        res.json({
            success: true,
            user: req.user
        });
    }
};