const express = require("express");
const router = express.Router();
const reportController = require("../controllers/reportController");
const authenticateToken = require("../middleware/auth");

// Rota de relatórios
router.get('/reports', authenticateToken, reportController.generateReport.bind(reportController));

module.exports = router;