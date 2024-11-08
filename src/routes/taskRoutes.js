const express = require("express");
const router = express.Router();
const taskController = require("../controllers/taskController");
const authenticateToken = require("../middleware/auth");

// Rotas de tarefas
router.get('/tasks', authenticateToken, taskController.getTasks.bind(taskController));
router.post('/tasks', authenticateToken, taskController.createTask.bind(taskController));
router.delete('/tasks/:id', authenticateToken, taskController.deleteTask.bind(taskController));
router.patch('/tasks/:id/status', authenticateToken, taskController.updateTaskStatus.bind(taskController));

// Rotas de tarefas fixas
router.get('/tasks/fixed', authenticateToken, taskController.getFixedTasks.bind(taskController));
router.post('/tasks/fixed', authenticateToken, taskController.createFixedTask.bind(taskController));
router.get('/tasks/fixed/history', authenticateToken, taskController.getFixedTaskHistory.bind(taskController));

// Rota de distribuição de tarefas
router.post('/tasks/distribute', authenticateToken, taskController.distributeTasks.bind(taskController));

module.exports = router;