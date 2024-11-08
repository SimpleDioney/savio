const express = require("express");
const router = express.Router();
const leaveController = require("../controllers/leaveController");
const authenticateToken = require("../middleware/auth");

// Rotas de folgas
router.get('/leaves', authenticateToken, leaveController.getLeaves.bind(leaveController));
router.post('/leaves', authenticateToken, leaveController.createLeave.bind(leaveController));
router.delete('/leaves/:id', authenticateToken, leaveController.deleteLeave.bind(leaveController));

// Rotas de solicitações de folga
router.get('/leave-requests', authenticateToken, leaveController.getLeaveRequests.bind(leaveController));
router.post('/leave-requests', authenticateToken, leaveController.createLeaveRequest.bind(leaveController));
router.post('/leave-requests/:id/:action', authenticateToken, leaveController.processLeaveRequest.bind(leaveController));

module.exports = router;