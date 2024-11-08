const express = require("express");
const router = express.Router();
const employeeController = require("../controllers/employeeController");
const authenticateToken = require("../middleware/auth");

// Rotas base de funcionários
router.post('/employees', authenticateToken, employeeController.createEmployee.bind(employeeController));
router.get('/employees', authenticateToken, employeeController.getEmployees.bind(employeeController));
router.get('/employees/available', authenticateToken, employeeController.getAvailableEmployees.bind(employeeController));
router.get('/employees/:id/leaves', authenticateToken, employeeController.getEmployeeLeaves.bind(employeeController));
router.get('/employees/:id/tasks', authenticateToken, employeeController.getEmployeeTasks.bind(employeeController));
router.put('/employees/:id', authenticateToken, employeeController.updateEmployee.bind(employeeController));
router.delete('/employees/:id', authenticateToken, employeeController.deleteEmployee.bind(employeeController));
router.get('/employees/:id/working-status', authenticateToken, employeeController.getWorkingStatus.bind(employeeController));

module.exports = router;