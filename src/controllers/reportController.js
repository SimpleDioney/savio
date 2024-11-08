const database = require("../models/database");

class ReportController {
    async generateReport(req, res) {
        try {
            const db = await database.getDb();
            const { type, date, store_id } = req.query;
            let startDate, endDate;

            // Definir período do relatório
            startDate = this.calculateReportPeriod(type, date);
            endDate = this.calculateReportEndDate(startDate, type);

            if (!startDate || !endDate) {
                return res.status(400).json({ message: 'Tipo de relatório inválido' });
            }

            // Formatar datas para SQL
            const sqlStartDate = startDate.toISOString().split('T')[0];
            const sqlEndDate = endDate.toISOString().split('T')[0];

            // Construir query base de acordo com as permissões
            let baseQuery = `
                SELECT 
                    t.*,
                    e.name as employee_name,
                    e.work_start,
                    e.work_end,
                    u.username,
                    s.name as store_name,
                    s.id as store_id
                FROM tasks t
                JOIN employees e ON t.employee_id = e.id
                LEFT JOIN users u ON e.id = u.employee_id
                LEFT JOIN stores s ON e.store_id = s.id
                WHERE t.date BETWEEN ? AND ?
            `;

            let queryParams = [sqlStartDate, sqlEndDate];

            // Adicionar filtro de loja se necessário
            if (store_id) {
                baseQuery += " AND s.id = ?";
                queryParams.push(store_id);
            }

            // Se não for admin, filtrar por employee_id
            if (!req.user.isAdmin) {
                baseQuery += " AND e.id = ?";
                queryParams.push(req.user.employeeId);
            }

            // Buscar tarefas
            const tasks = await db.all(baseQuery, queryParams);

            // Buscar folgas
            let leavesQuery = `
                SELECT 
                    l.*,
                    e.name as employee_name,
                    s.name as store_name,
                    s.id as store_id
                FROM leaves l
                JOIN employees e ON l.employee_id = e.id
                LEFT JOIN stores s ON e.store_id = s.id
                WHERE l.date BETWEEN ? AND ?
            `;

            let leavesParams = [sqlStartDate, sqlEndDate];

            if (store_id) {
                leavesQuery += " AND s.id = ?";
                leavesParams.push(store_id);
            }

            if (!req.user.isAdmin) {
                leavesQuery += " AND l.employee_id = ?";
                leavesParams.push(req.user.employeeId);
            }

            const leaves = await db.all(leavesQuery, leavesParams);

            // Calcular estatísticas
            const totalDays = Math.floor((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
            
            const stats = {
                storeStats: this.calculateStoreStats(tasks, leaves),
                employeeStats: this.calculateEmployeeStats(tasks, leaves, totalDays),
                taskStats: this.calculateTaskStats(tasks)
            };

            // Preparar resposta
            const response = {
                period: {
                    start: sqlStartDate,
                    end: sqlEndDate,
                    totalDays
                },
                summary: {
                    totalTasks: tasks.length,
                    totalCompleted: tasks.filter(t => t.status === 'concluido').length,
                    totalPending: tasks.filter(t => t.status === 'pendente').length,
                    totalInProgress: tasks.filter(t => t.status === 'em-andamento').length,
                    totalLeaves: leaves.length,
                    totalFixedTasks: tasks.filter(t => t.is_fixed).length,
                    totalRegularTasks: tasks.filter(t => !t.is_fixed).length
                },
                stats
            };

            res.json(response);
        } catch (error) {
            
            res.status(500).json({ 
                message: 'Erro ao gerar relatório',
                error: error.message 
            });
        }
    }

    calculateStoreStats(tasks, leaves) {
        const storeStats = {};

        // Agrupar por loja
        tasks.forEach(task => {
            if (!storeStats[task.store_id]) {
                storeStats[task.store_id] = {
                    storeName: task.store_name,
                    tasksTotal: 0,
                    tasksCompleted: 0,
                    employeesCount: new Set(),
                    leavesCount: 0
                };
            }

            storeStats[task.store_id].tasksTotal++;
            if (task.status === 'concluido') {
                storeStats[task.store_id].tasksCompleted++;
            }
            storeStats[task.store_id].employeesCount.add(task.employee_id);
        });

        // Adicionar contagem de folgas
        leaves.forEach(leave => {
            if (storeStats[leave.store_id]) {
                storeStats[leave.store_id].leavesCount++;
            }
        });

        // Calcular taxas e converter para array
        return Object.entries(storeStats).map(([storeId, stats]) => ({
            storeId: parseInt(storeId),
            storeName: stats.storeName,
            tasksTotal: stats.tasksTotal,
            tasksCompleted: stats.tasksCompleted,
            completionRate: ((stats.tasksCompleted / stats.tasksTotal) * 100 || 0).toFixed(1),
            employeesCount: stats.employeesCount.size,
            leavesCount: stats.leavesCount
        }));
    }

    calculateEmployeeStats(tasks, leaves, totalDays) {
        const employeeStats = {};

        // Agrupar por funcionário
        tasks.forEach(task => {
            if (!employeeStats[task.employee_id]) {
                employeeStats[task.employee_id] = {
                    employeeName: task.employee_name,
                    username: task.username,
                    storeName: task.store_name,
                    tasksTotal: 0,
                    tasksCompleted: 0,
                    leaves: 0,
                    fixedTasks: 0,
                    regularTasks: 0
                };
            }

            employeeStats[task.employee_id].tasksTotal++;
            if (task.status === 'concluido') {
                employeeStats[task.employee_id].tasksCompleted++;
            }
            if (task.is_fixed) {
                employeeStats[task.employee_id].fixedTasks++;
            } else {
                employeeStats[task.employee_id].regularTasks++;
            }
        });

        // Adicionar folgas
        leaves.forEach(leave => {
            if (employeeStats[leave.employee_id]) {
                employeeStats[leave.employee_id].leaves++;
            }
        });

        // Calcular taxas e converter para array
        return Object.entries(employeeStats).map(([employeeId, stats]) => {
            const workDays = totalDays - stats.leaves;
            return {
                employeeId: parseInt(employeeId),
                employeeName: stats.employeeName,
                username: stats.username,
                storeName: stats.storeName,
                tasksTotal: stats.tasksTotal,
                tasksCompleted: stats.tasksCompleted,
                completionRate: ((stats.tasksCompleted / stats.tasksTotal) * 100 || 0).toFixed(1),
                avgTasksPerDay: (stats.tasksTotal / workDays || 0).toFixed(1),
                leaves: stats.leaves,
                fixedTasks: stats.fixedTasks,
                regularTasks: stats.regularTasks
            };
        });
    }

    calculateTaskStats(tasks) {
        const taskStats = {};

        // Agrupar por tarefa
        tasks.forEach(task => {
            if (!taskStats[task.name]) {
                taskStats[task.name] = {
                    taskName: task.name,
                    frequency: 0,
                    completed: 0,
                    isFixed: task.is_fixed,
                    employees: new Set()
                };
            }

            taskStats[task.name].frequency++;
            if (task.status === 'concluido') {
                taskStats[task.name].completed++;
            }
            taskStats[task.name].employees.add(task.employee_name);
        });

        // Converter para array e calcular taxas
        return Object.values(taskStats).map(stats => ({
            taskName: stats.taskName,
            frequency: stats.frequency,
            completionRate: ((stats.completed / stats.frequency) * 100 || 0).toFixed(1),
            isFixed: stats.isFixed,
            employees: Array.from(stats.employees)
        }));
    }

    calculateReportPeriod(type, date) {
        const startDate = new Date(date);
        
        switch (type) {
            case 'daily':
                return startDate;
            case 'weekly':
                startDate.setDate(startDate.getDate() - startDate.getDay());
                return startDate;
            case 'monthly':
                startDate.setDate(1);
                return startDate;
            default:
                return null;
        }
    }

    calculateReportEndDate(startDate, type) {
        if (!startDate) return null;
        
        const endDate = new Date(startDate);
        switch (type) {
            case 'daily':
                return endDate;
            case 'weekly':
                endDate.setDate(endDate.getDate() + 6);
                return endDate;
            case 'monthly':
                endDate.setMonth(endDate.getMonth() + 1);
                endDate.setDate(0);
                return endDate;
            default:
                return null;
        }
    }
}

const reportController = new ReportController();
module.exports = reportController;