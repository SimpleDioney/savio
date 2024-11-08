const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const authenticateToken = require("../middleware/auth");

// Rota de login
router.post("/login", authController.login.bind(authController));

// Rota para verificar username
router.get("/users/check/:username", authenticateToken, authController.checkUsername.bind(authController));

module.exports = router;