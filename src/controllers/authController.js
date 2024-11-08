const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const database = require("../models/database");
const { JWT_SECRET } = require("../config/jwt");

class AuthController {
    async login(req, res) {
        try {
            const db = await database.getDb();
            const { username, password } = req.body;

            if (!username || !password) {
                return res.status(400).json({
                    message: "Usuário e senha são obrigatórios",
                });
            }

            const user = await db.get(
                `
                SELECT u.*, e.name as employee_name 
                FROM users u 
                LEFT JOIN employees e ON u.employee_id = e.id 
                WHERE u.username = ?
                `,
                [username]
            );

            if (!user) {
                return res.status(401).json({
                    message: "Usuário ou senha inválidos",
                });
            }

            const validPassword = await bcrypt.compare(password, user.password);
            if (!validPassword) {
                return res.status(401).json({
                    message: "Usuário ou senha inválidos",
                });
            }

            const token = jwt.sign(
                {
                    id: user.id,
                    username: user.username,
                    isAdmin: user.is_admin,
                    employeeId: user.employee_id,
                    employeeName: user.employee_name || user.username,
                },
                JWT_SECRET
            );

            res.json({
                token,
                isAdmin: user.is_admin,
                employeeName: user.employee_name || user.username,
            });
        } catch (error) {
            
            res.status(500).json({ message: "Erro ao realizar login" });
        }
    }

    async checkUsername(req, res) {
        try {
            const db = await database.getDb();
            const { username } = req.params;
            const user = await db.get(
                "SELECT id FROM users WHERE username = ?",
                [username]
            );

            res.json({ exists: !!user });
        } catch (error) {
            
            res.status(500).json({
                message: "Erro ao verificar usuário",
            });
        }
    }

    // Método auxiliar para gerar token JWT (usado internamente)
    generateToken(user) {
        return jwt.sign(
            {
                id: user.id,
                username: user.username,
                isAdmin: user.is_admin,
                employeeId: user.employee_id,
                employeeName: user.employee_name || user.username,
            },
            JWT_SECRET
        );
    }

    // Método auxiliar para validar credenciais (usado internamente)
    async validateCredentials(username, password) {
        const db = await database.getDb();
        const user = await db.get(
            `
            SELECT u.*, e.name as employee_name 
            FROM users u 
            LEFT JOIN employees e ON u.employee_id = e.id 
            WHERE u.username = ?
            `,
            [username]
        );

        if (!user) {
            return null;
        }

        const validPassword = await bcrypt.compare(password, user.password);
        return validPassword ? user : null;
    }

    // Método para hash de senha (usado ao criar/atualizar usuários)
    async hashPassword(password) {
        return await bcrypt.hash(password, 10);
    }
}

// Exporta uma instância única do controller
const authController = new AuthController();
module.exports = authController;