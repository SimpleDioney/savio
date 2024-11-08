const database = require("../models/database");

class TaskController {
    async getTasks(req, res) {
        try {
            const db = await database.getDb();
            const { date, status, store_id } = req.query;
            const selectedDate = date || new Date().toISOString().split('T')[0];

            let query = `
                SELECT 
                    t.*,
                    e.name as employee_name,
                    s.name as store_name,
                    CASE 
                        WHEN t.is_fixed = 1 THEN 
                            COALESCE(
                                (SELECT status 
                                 FROM fixed_task_status 
                                 WHERE task_id = t.id AND date = ?),
                                'pendente'
                            )
                        ELSE t.status 
                    END as current_status
                FROM tasks t
                LEFT JOIN employees e ON t.employee_id = e.id
                LEFT JOIN stores s ON t.store_id = s.id
                WHERE (t.date = ? OR t.is_fixed = 1)
            `;
            
            const params = [selectedDate, selectedDate];

            if (store_id) {
                query += ' AND t.store_id = ?';
                params.push(store_id);
            }

            if (status) {
                query += ` AND (
                    CASE 
                        WHEN t.is_fixed = 1 THEN 
                            COALESCE(
                                (SELECT status 
                                 FROM fixed_task_status 
                                 WHERE task_id = t.id AND date = ?),
                                'pendente'
                            )
                        ELSE t.status 
                    END
                ) = ?`;
                params.push(selectedDate, status);
            }

            const tasks = await db.all(query, params);

            // Processar cada tarefa para garantir o status correto
            const processedTasks = tasks.map(task => ({
                ...task,
                status: task.current_status,
                original_status: task.status
            }));

            res.json(processedTasks);
        } catch (error) {
            console.error('Erro ao buscar tarefas:', error);
            res.status(500).json({ 
                message: 'Erro ao buscar tarefas',
                error: error.message 
            });
        }
    }

    async createTask(req, res) {
        try {
            const db = await database.getDb();
            const { name, description, employeeId, priority, isFixed, date, store_id } = req.body;

            if (!name || !store_id) {
                return res.status(400).json({
                    message: 'Nome da tarefa e loja são obrigatórios'
                });
            }

            const result = await database.withTransaction(async () => {
                const taskResult = await db.run(
                    `INSERT INTO tasks (
                        name, description, employee_id, priority, is_fixed, date, store_id, status
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pendente')`,
                    [
                        name,
                        description || null,
                        employeeId || null,
                        priority || 1,
                        isFixed ? 1 : 0,
                        date,
                        store_id
                    ]
                );

                // Se for uma tarefa fixa, inserir o status inicial
                if (isFixed) {
                    await db.run(
                        `INSERT INTO fixed_task_status (task_id, date, status) 
                         VALUES (?, ?, 'pendente')`,
                        [taskResult.lastID, date]
                    );
                }

                const newTask = await db.get(
                    `SELECT t.*, 
                            e.name as employee_name, 
                            s.name as store_name 
                     FROM tasks t 
                     LEFT JOIN employees e ON t.employee_id = e.id 
                     LEFT JOIN stores s ON t.store_id = s.id 
                     WHERE t.id = ?`,
                    [taskResult.lastID]
                );

                return newTask;
            });

            res.json({
                ...result,
                message: 'Tarefa criada com sucesso'
            });
        } catch (error) {
            console.error('Erro ao criar tarefa:', error);
            res.status(500).json({ 
                message: 'Erro ao criar tarefa',
                error: error.message 
            });
        }
    }

    async deleteTask(req, res) {
        try {
            const db = await database.getDb();
            const { id } = req.params;

            // Verificar se a tarefa existe
            const task = await db.get("SELECT * FROM tasks WHERE id = ?", [id]);
            if (!task) {
                return res.status(404).json({ message: "Tarefa não encontrada" });
            }

            // Se for admin, pode deletar qualquer tarefa
            if (req.user.isAdmin) {
                await database.withTransaction(async () => {
                    if (task.is_fixed) {
                        // Deletar registros de status da tarefa fixa
                        await db.run("DELETE FROM fixed_task_status WHERE task_id = ?", [id]);
                        // Deletar registros do histórico
                        await db.run("DELETE FROM task_history WHERE task_id = ?", [id]);
                    }
                    // Deletar a tarefa
                    await db.run("DELETE FROM tasks WHERE id = ?", [id]);
                });

                return res.json({ message: "Tarefa excluída com sucesso" });
            }

            // Para não-admin, verificar se é uma tarefa fixa
            if (task.is_fixed) {
                return res.status(403).json({
                    message: "Apenas administradores podem excluir tarefas fixas",
                });
            }

            // Verificar se é a própria tarefa
            if (task.employee_id !== req.user.employeeId) {
                return res.status(403).json({
                    message: "Sem permissão para excluir esta tarefa",
                });
            }

            // Verificar horário de trabalho do funcionário
            const employee = await db.get(
                "SELECT work_start, work_end FROM employees WHERE id = ?",
                [req.user.employeeId]
            );

            const now = new Date();
            const currentTime = `${now.getHours().toString().padStart(2, "0")}:${now
                .getMinutes()
                .toString()
                .padStart(2, "0")}`;

            if (currentTime < employee.work_start || currentTime > employee.work_end) {
                return res.status(403).json({
                    message: "Você só pode excluir tarefas durante seu horário de trabalho",
                });
            }

            // Deletar a tarefa
            await db.run("DELETE FROM tasks WHERE id = ?", [id]);
            res.json({ message: "Tarefa excluída com sucesso" });
        } catch (error) {
            console.error("Erro ao excluir tarefa:", error);
            res.status(500).json({ message: "Erro ao excluir tarefa" });
        }
    }

    async updateTaskStatus(req, res) {
        try {
            const db = await database.getDb();
            const { id } = req.params;
            const { status, date } = req.body;

            // Verificar se a tarefa existe e obter suas informações
            const task = await db.get(
                `SELECT t.*, e.store_id as employee_store_id 
                 FROM tasks t
                 LEFT JOIN employees e ON t.employee_id = e.id 
                 WHERE t.id = ?`,
                [id]
            );

            if (!task) {
                return res.status(404).json({ message: "Tarefa não encontrada" });
            }

            // Verificar permissões
            if (!req.user.isAdmin) {
                // Se não for admin, verificar se é a própria tarefa
                if (task.employee_id !== req.user.employeeId) {
                    return res.status(403).json({
                        message: "Sem permissão para atualizar esta tarefa"
                    });
                }

                // Verificar se pertence à mesma loja
                const userEmployee = await db.get(
                    'SELECT store_id FROM employees WHERE id = ?',
                    [req.user.employeeId]
                );

                if (!userEmployee || userEmployee.store_id !== task.employee_store_id) {
                    return res.status(403).json({
                        message: "Você só pode atualizar tarefas da sua própria loja"
                    });
                }
            }

            // Usar a data fornecida ou a data atual
            const taskDate = date || new Date().toISOString().split("T")[0];

            if (task.is_fixed) {
                await database.withTransaction(async () => {
                    // Para tarefas fixas, atualizar ou inserir status do dia
                    await db.run(
                        `INSERT INTO fixed_task_status (task_id, date, status)
                         VALUES (?, ?, ?)
                         ON CONFLICT (task_id, date) 
                         DO UPDATE SET status = ?`,
                        [id, taskDate, status, status]
                    );
                });

                // Buscar o status atualizado para confirmar
                const updatedStatus = await db.get(
                    'SELECT status FROM fixed_task_status WHERE task_id = ? AND date = ?',
                    [id, taskDate]
                );

                return res.json({ 
                    message: "Status atualizado com sucesso",
                    currentStatus: updatedStatus.status,
                    date: taskDate
                });
            } else {
                // Para tarefas regulares, atualizar diretamente
                await db.run(
                    "UPDATE tasks SET status = ? WHERE id = ?",
                    [status, id]
                );

                return res.json({ 
                    message: "Status atualizado com sucesso",
                    currentStatus: status
                });
            }
        } catch (error) {
            console.error("Erro ao atualizar status:", error);
            res.status(500).json({ message: "Erro ao atualizar status" });
        }
    }

    async getFixedTasks(req, res) {
        try {
            const db = await database.getDb();
            const tasks = await db.all("SELECT * FROM tasks WHERE is_fixed = 1");
            res.json(tasks);
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: "Erro ao buscar tarefas fixas" });
        }
    }

    async createFixedTask(req, res) {
        try {
            const db = await database.getDb();
            const { name, employeeId } = req.body;

            // Verificar se já existe uma tarefa fixa para este funcionário
            const existingTask = await db.get(
                "SELECT * FROM tasks WHERE name = ? AND is_fixed = 1",
                [name]
            );

            if (existingTask) {
                return res.status(400).json({ message: "Tarefa fixa já existe" });
            }

            const result = await db.run(
                "INSERT INTO tasks (name, employee_id, is_fixed) VALUES (?, ?, 1)",
                [name, employeeId]
            );

            res.json({
                id: result.lastID,
                name,
                employeeId,
                isFixed: true,
            });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: "Erro ao criar tarefa fixa" });
        }
    }

    async getFixedTaskHistory(req, res) {
        try {
            const db = await database.getDb();
            const { start, end } = req.query;

            const history = await db.all(
                `
                SELECT t.name as task_name, 
                       e.name as employee_name,
                       fts.date,
                       fts.status
                FROM fixed_task_status fts
                JOIN tasks t ON fts.task_id = t.id
                JOIN employees e ON t.employee_id = e.id
                WHERE fts.date BETWEEN ? AND ?
                ORDER BY fts.date DESC, t.name
                `,
                [start, end]
            );

            res.json(history);
        } catch (error) {
            console.error("Erro ao buscar histórico:", error);
            res.status(500).json({ message: "Erro ao buscar histórico" });
        }
    }

    async distributeTasks(req, res) {
        try {
            const db = await database.getDb();
            const { store_id, date } = req.body;
            
            // Configuração de data e hora
            const now = new Date();
            // Ajuste para horário local
            const localNow = new Date(now.getTime() - (now.getTimezoneOffset() * 60000));
            const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
            const today = date || localNow.toISOString().split('T')[0];
    
            // Criar datas no timezone local
            const createLocalDate = (dateString) => {
                const [year, month, day] = dateString.split('-').map(Number);
                return new Date(year, month - 1, day);
            };
    
            // Comparação de datas usando datas locais
            const nowDate = createLocalDate(localNow.toISOString().split('T')[0]);
            const selectedDate = createLocalDate(today);
            const dayOfWeek = selectedDate.getDay() || 7; // Converte 0 (Domingo) para 7
    
            // Verificar se é hoje ou futuro
            const isToday = nowDate.getTime() === selectedDate.getTime();
            const isFuture = selectedDate.getTime() > nowDate.getTime();
    
            console.log('Debug - Verificação de data:', {
                dataAtualLocal: nowDate.toLocaleString(),
                dataSelecionadaLocal: selectedDate.toLocaleString(),
                diaSemana: dayOfWeek,
                nomeDia: ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'][selectedDate.getDay()],
                isToday,
                isFuture,
                currentTime,
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
            });
            
            if (!store_id) {
                return res.status(400).json({
                    message: 'ID da loja é obrigatório'
                });
            }
    
            // Verificar tarefas não atribuídas
            const unassignedTasks = await db.all(`
                SELECT * FROM tasks 
                WHERE date = ? 
                AND store_id = ?
                AND is_fixed = 0 
                AND (employee_id IS NULL OR employee_id = 0)
                ORDER BY priority DESC, id ASC
            `, [today, store_id]);
    
            if (unassignedTasks.length === 0) {
                return res.status(400).json({
                    message: 'Não há tarefas para distribuir'
                });
            }
    
            // Buscar funcionários com informações de horário para o dia específico
            const employees = await db.all(`
                SELECT 
                    e.*,
                    COALESCE(task_count.count, 0) as current_task_count,
                    CASE 
                        WHEN EXISTS (
                            SELECT 1 FROM leaves l 
                            WHERE l.employee_id = e.id 
                            AND l.date = ?
                        ) THEN 1 
                        ELSE 0 
                    END as on_leave,
                    CASE
                        WHEN e.alternative_schedule IS NOT NULL 
                            AND json_valid(e.alternative_schedule)
                            AND json_extract(e.alternative_schedule, '$.${dayOfWeek}') IS NOT NULL
                        THEN json_extract(e.alternative_schedule, '$.${dayOfWeek}.work_start')
                        ELSE e.work_start
                    END as effective_work_start,
                    CASE
                        WHEN e.alternative_schedule IS NOT NULL 
                            AND json_valid(e.alternative_schedule)
                            AND json_extract(e.alternative_schedule, '$.${dayOfWeek}') IS NOT NULL
                        THEN json_extract(e.alternative_schedule, '$.${dayOfWeek}.work_end')
                        ELSE e.work_end
                    END as effective_work_end,
                    CASE
                        WHEN e.alternative_schedule IS NOT NULL 
                            AND json_valid(e.alternative_schedule)
                            AND json_extract(e.alternative_schedule, '$.${dayOfWeek}') IS NOT NULL
                        THEN 1
                        ELSE 0
                    END as is_alternative_schedule
                FROM employees e
                LEFT JOIN (
                    SELECT employee_id, COUNT(*) as count
                    FROM tasks
                    WHERE date = ?
                    GROUP BY employee_id
                ) task_count ON e.id = task_count.employee_id
                WHERE e.store_id = ? 
                AND e.active = 1
            `, [today, today, store_id]);
    
            // Processar e mostrar horários para debug
            employees.forEach(emp => {
                let scheduleInfo;
                if (emp.alternative_schedule) {
                    try {
                        const schedule = JSON.parse(emp.alternative_schedule);
                        scheduleInfo = {
                            padrao: {
                                inicio: emp.work_start,
                                fim: emp.work_end
                            },
                            alternativo: schedule[dayOfWeek],
                            diaAtual: dayOfWeek,
                            usandoAlternativo: emp.is_alternative_schedule === 1
                        };
                    } catch (e) {
                        scheduleInfo = { erro: 'Erro ao processar horário alternativo' };
                    }
                }
    
                console.log(`Debug - Horários de ${emp.name}:`, {
                    horarioPadrao: {
                        inicio: emp.work_start,
                        fim: emp.work_end
                    },
                    horarioEfetivo: {
                        inicio: emp.effective_work_start,
                        fim: emp.effective_work_end
                    },
                    detalhesHorario: scheduleInfo,
                    horarioAtual: currentTime
                });
            });
    
            // Filtrar funcionários disponíveis
            const availableEmployees = employees.filter(emp => {
                // Primeiro verifica folga
                if (emp.on_leave === 1) {
                    console.log(`${emp.name} está de folga`);
                    return false;
                }
    
                const isInWorkHours = currentTime >= emp.effective_work_start && 
                                    currentTime <= emp.effective_work_end;
    
                console.log(`Verificação de horário para ${emp.name}:`, {
                    horarioAtual: currentTime,
                    inicioExpediente: emp.effective_work_start,
                    fimExpediente: emp.effective_work_end,
                    dentroDoHorario: isInWorkHours,
                    eHoje: isToday,
                    eFuturo: isFuture,
                    usandoHorarioAlternativo: emp.is_alternative_schedule === 1,
                    diaVerificado: {
                        numero: dayOfWeek,
                        nome: ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'][selectedDate.getDay()]
                    }
                });
    
                // Se for hoje, deve estar dentro do horário de trabalho
                if (isToday && !isInWorkHours) {
                    console.log(`${emp.name} está fora do horário de trabalho (${currentTime} não está entre ${emp.effective_work_start} e ${emp.effective_work_end})`);
                    return false;
                }
    
                // Para datas futuras, verificar início do expediente
                if (!isToday && currentTime < emp.effective_work_start) {
                    console.log(`${emp.name} ainda não iniciou o expediente`);
                    return false;
                }
    
                return true;
            });
    
            console.log('Debug - Funcionários disponíveis:', {
                total: availableEmployees.length,
                dataAtual: today,
                horaAtual: currentTime,
                detalhes: availableEmployees.map(emp => ({
                    nome: emp.name,
                    horarioInicio: emp.effective_work_start,
                    horarioFim: emp.effective_work_end,
                    tarefasAtuais: emp.current_task_count,
                    usandoHorarioAlternativo: emp.is_alternative_schedule === 1,
                    status: isToday ? 'Dentro do expediente' : 'Data futura'
                }))
            });
    
            if (availableEmployees.length === 0) {
                return res.status(400).json({
                    message: 'Não há funcionários disponíveis no momento',
                    details: {
                        currentTime,
                        employeesStatus: employees.map(emp => ({
                            name: emp.name,
                            status: emp.on_leave === 1 ? 'De folga' : 
                                   isToday ? 
                                     (currentTime >= emp.effective_work_start && 
                                      currentTime <= emp.effective_work_end ? 
                                        'Disponível' : 'Fora do expediente') :
                                     'Horário ainda não iniciado',
                            workStart: emp.effective_work_start,
                            workEnd: emp.effective_work_end,
                            isAlternativeSchedule: emp.is_alternative_schedule === 1
                        }))
                    }
                });
            }
    
            // Distribuir tarefas
            const result = await database.withTransaction(async () => {
                const distributions = [];
                
                for (const task of unassignedTasks) {
                    // Encontrar funcionário com menos tarefas
                    const selectedEmployee = availableEmployees.reduce((prev, curr) => {
                        const prevTasks = distributions.filter(d => d.employeeId === prev.id).length + 
                                        (prev.current_task_count || 0);
                        const currTasks = distributions.filter(d => d.employeeId === curr.id).length + 
                                        (curr.current_task_count || 0);
                        return prevTasks <= currTasks ? prev : curr;
                    });
    
                    await db.run(
                        'UPDATE tasks SET employee_id = ? WHERE id = ?',
                        [selectedEmployee.id, task.id]
                    );
    
                    await db.run(
                        'INSERT INTO task_history (task_id, employee_id, date) VALUES (?, ?, ?)',
                        [task.id, selectedEmployee.id, today]
                    );
    
                    distributions.push({
                        taskId: task.id,
                        taskName: task.name,
                        employeeId: selectedEmployee.id,
                        employeeName: selectedEmployee.name,
                        previousTaskCount: selectedEmployee.current_task_count,
                        newTaskCount: (selectedEmployee.current_task_count || 0) + 
                                    distributions.filter(d => d.employeeId === selectedEmployee.id).length + 1
                    });
    
                    selectedEmployee.current_task_count = distributions.filter(d => 
                        d.employeeId === selectedEmployee.id
                    ).length + (selectedEmployee.current_task_count || 0);
                }
    
                return {
                    success: true,
                    message: `${distributions.length} tarefas distribuídas com sucesso`,
                    distributions,
                    details: {
                        date: today,
                        time: currentTime,
                        distribuicaoPorFuncionario: availableEmployees.map(emp => ({
                            nome: emp.name,
                            tarefasAnteriores: emp.current_task_count,
                            tarefasNovas: distributions.filter(d => d.employeeId === emp.id).length,
                            totalTarefas: emp.current_task_count + 
                                        distributions.filter(d => d.employeeId === emp.id).length,
                            horarioUtilizado: emp.is_alternative_schedule === 1 ? 'Alternativo' : 'Padrão'
                        }))
                    }
                };
            });
    
            res.json(result);
    
        } catch (error) {
            console.error('Erro na distribuição de tarefas:', error);
            res.status(500).json({
                success: false,
                message: 'Erro ao distribuir tarefas',
                error: error.message,
                details: {
                    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                    serverTime: new Date().toLocaleString()
                }
            });
        }
    }
}
// Exporta uma instância única do controller
const taskController = new TaskController();
module.exports = taskController;