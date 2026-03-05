import jwt from "jsonwebtoken";

export const authMiddleware = (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return res.status(401).json({
                success: false,
                message: "Token tidak ditemukan"
            });
        }

        const token = authHeader.split(' ')[1]?.trim();
        
        if (token.length < 50) {
            console.log('⚠️ Possible API Key received in authMiddleware:', token.substring(0, 10) + '...');
            
            return res.status(401).json({
                success: false,
                message: "Invalid token format"
            });
        }
        
        const decoded = jwt.verify(
            token, 
            process.env.JWT_SECRET || "MyVerySecretKey123"
        );
        
        req.user = decoded;
        next();
        
    } catch (err) {
        console.error("Auth middleware error:", err);
        
        if (err.name === "TokenExpiredError") {
            return res.status(401).json({
                success: false,
                message: "Token telah expired"
            });
        }
        
        if (err.name === "JsonWebTokenError") {
            return res.status(401).json({
                success: false,
                message: "Token tidak valid"
            });
        }
        
        return res.status(500).json({
            success: false,
            message: "Authentication error"
        });
    }
};