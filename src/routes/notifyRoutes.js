const express = require("express");
const router = express.Router();
const notifyController = require("../controllers/notifyController");
const authenticateToken = require("../middleware/auth");

// Rota de login
router.post("/fcmtoken", authenticateToken, notifyController.fcmTokenRegister.bind(notifyController));

module.exports = router;
