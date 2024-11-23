const database = require("../models/database");
const authController = require("./authController");

class EmployeeController {
    async createEmployee(req, res) {
        const db = await database.getDb();
        try {
            const { 
                name, 
                username, 
                password, 
                workStart, 
                workEnd, 
                store_id, 
                alternativeSchedule 
            } = req.body;
            
            if (!name || !username || !password || !store_id) {
                return res.status(400).json({ 
                    message: 'Nome, usuário, senha e loja são obrigatórios' 
                });
            }

            // Validar formato do alternativeSchedule se fornecido
            if (alternativeSchedule) {
                try {
                    const schedule = typeof alternativeSchedule === 'string' ? 
                        JSON.parse(alternativeSchedule) : alternativeSchedule;
                    
                    // Validar formato do horário alternativo
                    for (const [day, times] of Object.entries(schedule)) {
                        const dayNum = parseInt(day);
                        if (dayNum < 1 || dayNum > 7) {
                            throw new Error('Dia da semana inválido');
                        }
                        if (!times.work_start || !times.work_end) {
                            throw new Error('Formato de horário inválido');
                        }
                        // Validar formato de hora (HH:MM)
                        const timeRegex = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/;
                        if (!timeRegex.test(times.work_start) || !timeRegex.test(times.work_end)) {
                            throw new Error('Formato de hora inválido');
                        }
                    }
                } catch (error) {
                    return res.status(400).json({
                        message: 'Formato de horário alternativo inválido',
                        error: error.message
                    });
                }
            }

            const result = await database.withTransaction(async () => {
                // Inserir funcionário
                const db = await database.getDb();
                const empResult = await db.run(
                    `INSERT INTO employees (
                        name, 
                        active, 
                        work_start, 
                        work_end, 
                        store_id,
                        alternative_schedule
                    ) VALUES (?, ?, ?, ?, ?, ?)`,
                    [
                        name, 
                        true, 
                        workStart,
                        workEnd,
                        store_id,
                        alternativeSchedule ? JSON.stringify(alternativeSchedule) : null
                    ]
                );
                
                const hashedPassword = await authController.hashPassword(password);
                
                // Criar usuário
                await db.run(
                    'INSERT INTO users (username, password, is_admin, employee_id) VALUES (?, ?, ?, ?)',
                    [username, hashedPassword, false, empResult.lastID]
                );
                
                // Buscar o funcionário criado
                const newEmployee = await db.get(
                    `SELECT 
                        e.id, 
                        e.name, 
                        e.work_start, 
                        e.work_end,
                        e.alternative_schedule,
                        e.store_id,
                        u.username
                    FROM employees e
                    LEFT JOIN users u ON e.id = u.employee_id
                    WHERE e.id = ?`,
                    [empResult.lastID]
                );

                // Parse do alternative_schedule para o response
                if (newEmployee.alternative_schedule) {
                    newEmployee.alternative_schedule = JSON.parse(newEmployee.alternative_schedule);
                }

                return newEmployee;
            });

            res.json({ 
                ...result,
                message: 'Funcionário criado com sucesso'
            });
        } catch (error) {
            
            res.status(500).json({ 
                message: 'Erro ao criar funcionário',
                error: error.message
            });
        }
    }

    async getEmployees(req, res) {
        try {
            const db = await database.getDb();
            const { store_id } = req.query;
            let query = `
                SELECT 
                    e.*,
                    u.username,
                    s.name as store_name,
                    CASE 
                        WHEN EXISTS (
                            SELECT 1 FROM leaves l 
                            WHERE l.employee_id = e.id 
                            AND l.date = date('now', 'localtime')
                        ) THEN 1 
                        ELSE 0 
                    END as on_leave,
                    CASE
                        WHEN time('now', 'localtime') BETWEEN time(e.work_start) AND time(e.work_end) THEN 1
                        ELSE 0
                    END as is_working
                FROM employees e
                LEFT JOIN users u ON e.id = u.employee_id
                LEFT JOIN stores s ON e.store_id = s.id
                WHERE e.active = 1
            `;

            const params = [];

            if (store_id) {
                query += ' AND e.store_id = ?';
                params.push(store_id);
            }

            query += ' ORDER BY s.name, e.name';
            
            const employees = await db.all(query, params);
            res.json(employees);
        } catch (error) {
            
            res.status(500).json({ message: 'Erro ao buscar funcionários' });
        }
    }

    async getAvailableEmployees(req, res) {
        try {
            const db = await database.getDb();
            const { date } = req.query;

            const employees = await db.all(
                `
                SELECT e.*, 
                       CASE WHEN l.id IS NOT NULL THEN 1 ELSE 0 END as on_leave,
                       (SELECT COUNT(*) FROM tasks t 
                        WHERE t.employee_id = e.id 
                        AND t.date = ?) as task_count
                FROM employees e
                LEFT JOIN leaves l ON e.id = l.employee_id 
                    AND l.date = ?
                WHERE e.active = 1
                ORDER BY on_leave, task_count
                `,
                [date, date]
            );

            res.json(employees);
        } catch (error) {
            
            res.status(500).json({ message: "Erro ao verificar disponibilidade" });
        }
    }

    async getEmployeeLeaves(req, res) {
        try {
            const { id } = req.params;
            const db = await database.getDb();
            const { month, year } = req.query;

            let query = "SELECT * FROM leaves WHERE employee_id = ?";
            const params = [id];

            if (month && year) {
                query += " AND strftime('%Y-%m', date) = ?";
                params.push(`${year}-${month.padStart(2, "0")}`);
            }

            const leaves = await db.all(query, params);
            res.json(leaves);
        } catch (error) {
            
            res.status(500).json({ message: "Erro ao buscar folgas do funcionário" });
        }
    }

    async getEmployeeTasks(req, res) {
        try {
            const { id } = req.params;
            const db = await database.getDb();
            const { date } = req.query;

            const query = `
                SELECT 
                    t.*,
                    e.name as employee_name,
                    COALESCE(fts.status, t.status) as current_status
                FROM tasks t
                LEFT JOIN employees e ON t.employee_id = e.id
                LEFT JOIN fixed_task_status fts ON t.id = fts.task_id AND fts.date = ?
                WHERE t.employee_id = ? 
                AND (t.date = ? OR t.is_fixed = 1)
            `;

            const tasks = await db.all(query, [date, id, date]);

            // Processar o status das tarefas
            const processedTasks = tasks.map(task => ({
                ...task,
                status: task.is_fixed ? task.current_status : task.status,
            }));

            res.json(processedTasks);
        } catch (error) {
            
            res.status(500).json({ message: 'Erro ao buscar tarefas' });
        }
    }

    async updateEmployee(req, res) {
        try {
            const db = await database.getDb();
            const { id } = req.params;
            const { 
                name, 
                username, 
                password, 
                workStart, 
                workEnd,
                alternativeSchedule,
                store_id  // Adicionando store_id aos parâmetros
            } = req.body;
    
            // Validar alternativeSchedule se fornecido
            if (alternativeSchedule) {
                try {
                    const schedule = typeof alternativeSchedule === 'string' ? 
                        JSON.parse(alternativeSchedule) : alternativeSchedule;
                    
                    for (const [day, times] of Object.entries(schedule)) {
                        const dayNum = parseInt(day);
                        if (dayNum < 1 || dayNum > 7) {
                            throw new Error('Dia da semana inválido');
                        }
                        if (!times.work_start || !times.work_end) {
                            throw new Error('Formato de horário inválido');
                        }
                        const timeRegex = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/;
                        if (!timeRegex.test(times.work_start) || !timeRegex.test(times.work_end)) {
                            throw new Error('Formato de hora inválido');
                        }
                    }
                } catch (error) {
                    return res.status(400).json({
                        message: 'Formato de horário alternativo inválido',
                        error: error.message
                    });
                }
            }
    
            const result = await database.withTransaction(async () => {
                // Atualizar informações do funcionário
                const db = await database.getDb();
                await db.run(
                    `UPDATE employees 
                     SET name = ?, 
                         work_start = ?, 
                         work_end = ?,
                         alternative_schedule = ?,
                         store_id = ?  
                     WHERE id = ?`,
                    [
                        name,
                        workStart || "09:00",
                        workEnd || "18:00",
                        alternativeSchedule ? JSON.stringify(alternativeSchedule) : null,
                        store_id,  // Incluindo store_id na atualização
                        id
                    ]
                );
    
                // Atualizar usuário se necessário
                if (username || password) {
                    let query = "UPDATE users SET";
                    const params = [];
    
                    if (username) {
                        query += " username = ?";
                        params.push(username);
                    }
    
                    if (password) {
                        const hashedPassword = await authController.hashPassword(password);
                        query += username ? ", password = ?" : " password = ?";
                        params.push(hashedPassword);
                    }
    
                    query += " WHERE employee_id = ?";
                    params.push(id);
    
                    await db.run(query, params);
                }
    
                // Buscar funcionário atualizado
                const updatedEmployee = await db.get(
                    `SELECT 
                        e.*, 
                        u.username,
                        s.name as store_name
                     FROM employees e 
                     LEFT JOIN users u ON e.id = u.employee_id 
                     LEFT JOIN stores s ON e.store_id = s.id
                     WHERE e.id = ?`,
                    [id]
                );
    
                // Parse do alternative_schedule para o response
                if (updatedEmployee.alternative_schedule) {
                    updatedEmployee.alternative_schedule = JSON.parse(updatedEmployee.alternative_schedule);
                }
    
                return updatedEmployee;
            });
    
            res.json({
                ...result,
                message: "Funcionário atualizado com sucesso"
            });
        } catch (error) {
            res.status(500).json({ 
                message: "Erro ao atualizar funcionário",
                error: error.message 
            });
        }
    }

    async deleteEmployee(req, res) {
        try {
            const employeeId = req.params.id;
            const db = await database.getDb();
            await database.withTransaction(async () => {
                // Verificar se existem tarefas associadas
                const tasks = await db.all(
                    'SELECT * FROM tasks WHERE employee_id = ?',
                    [employeeId]
                );

                if (tasks.length > 0) {
                    // Opcionalmente, você pode deletar as tarefas também
                    await db.run(
                        'DELETE FROM tasks WHERE employee_id = ?',
                        [employeeId]
                    );
                }

                // Deletar registros do histórico de tarefas
                await db.run(
                    'DELETE FROM task_history WHERE employee_id = ?',
                    [employeeId]
                );

                // Deletar folgas do funcionário
                await db.run(
                    'DELETE FROM leaves WHERE employee_id = ?',
                    [employeeId]
                );

                // Deletar o usuário associado ao funcionário
                await db.run(
                    'DELETE FROM users WHERE employee_id = ?',
                    [employeeId]
                );

                // Por fim, deletar o funcionário
                const result = await db.run(
                    'DELETE FROM employees WHERE id = ?',
                    [employeeId]
                );

                if (result.changes === 0) {
                    throw new Error('Funcionário não encontrado');
                }
            });

            res.json({ message: 'Funcionário excluído com sucesso' });
        } catch (error) {
            
            if (error.message === 'Funcionário não encontrado') {
                res.status(404).json({ message: error.message });
            } else {
                res.status(500).json({ message: 'Erro ao excluir funcionário' });
            }
        }
    }

    async getWorkingStatus(req, res) {
        try {
            const db = await database.getDb();
            const { id } = req.params;
            const employee = await db.get(
                "SELECT work_start, work_end, alternative_schedule FROM employees WHERE id = ?",
                [id]
            );

            if (!employee) {
                return res.status(404).json({ message: "Funcionário não encontrado" });
            }

            const now = new Date();
            const currentDay = now.getDay() || 7; // 0-6 (Domingo = 0) para 1-7 (Domingo = 7)
            const currentTime = `${now.getHours().toString().padStart(2, "0")}:${now
                .getMinutes()
                .toString()
                .padStart(2, "0")}`;

            let workStart = employee.work_start;
            let workEnd = employee.work_end;

            // Verificar se há horário alternativo para o dia atual
            if (employee.alternative_schedule) {
                try {
                    const alternativeSchedule = JSON.parse(employee.alternative_schedule);
                    if (alternativeSchedule[currentDay]) {
                        workStart = alternativeSchedule[currentDay].work_start;
                        workEnd = alternativeSchedule[currentDay].work_end;
                    }
                } catch (error) {
                    
                    // Em caso de erro, mantém o horário padrão
                }
            }

            const isWithinHours = currentTime >= workStart && currentTime <= workEnd;

            res.json({
                isWorking: isWithinHours,
                workStart: workStart,
                workEnd: workEnd,
                currentDay: currentDay,
                currentTime: currentTime,
                isAlternativeSchedule: workStart !== employee.work_start || workEnd !== employee.work_end
            });
        } catch (error) {
            
            res.status(500).json({ 
                message: "Erro ao verificar status de trabalho",
                error: error.message 
            });
        }
    }

    // Método auxiliar para validar horário alternativo
    async validateAlternativeSchedule(schedule) {
        try {
            const db = await database.getDb();
            const scheduleObj = typeof schedule === 'string' ? 
                JSON.parse(schedule) : schedule;
            
            for (const [day, times] of Object.entries(scheduleObj)) {
                const dayNum = parseInt(day);
                if (dayNum < 1 || dayNum > 7) {
                    throw new Error('Dia da semana inválido');
                }
                if (!times.work_start || !times.work_end) {
                    throw new Error('Formato de horário inválido');
                }
                const timeRegex = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/;
                if (!timeRegex.test(times.work_start) || !timeRegex.test(times.work_end)) {
                    throw new Error('Formato de hora inválido');
                }
            }
            return true;
        } catch (error) {
            throw new Error(`Formato de horário alternativo inválido: ${error.message}`);
        }
    }
}

// Exporta uma instância única do controller
const employeeController = new EmployeeController();
module.exports = employeeController;