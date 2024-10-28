const express = require('express');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const JWT_SECRET = 'seu_secret_key_aqui';
let db;

// Inicialização do banco de dados
async function initializeDb() {
    db = await open({
        filename: './database.sqlite',
        driver: sqlite3.Database
    });

    await db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            password TEXT,
            is_admin BOOLEAN
        );

        CREATE TABLE IF NOT EXISTS employees (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            active BOOLEAN DEFAULT TRUE
        );

        CREATE TABLE IF NOT EXISTS tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            employee_id INTEGER,
            date TEXT,
            is_fixed BOOLEAN DEFAULT FALSE,
            status TEXT DEFAULT 'pendente',
            priority INTEGER DEFAULT 1,
            FOREIGN KEY (employee_id) REFERENCES employees (id)
        );

        CREATE TABLE IF NOT EXISTS leaves (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            employee_id INTEGER,
            date TEXT,
            type TEXT DEFAULT 'folga',
            FOREIGN KEY (employee_id) REFERENCES employees (id)
        );

        CREATE TABLE IF NOT EXISTS task_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id INTEGER,
            employee_id INTEGER,
            date TEXT,
            FOREIGN KEY (task_id) REFERENCES tasks (id),
            FOREIGN KEY (employee_id) REFERENCES employees (id)
        );
    `);

    // Criar usuário admin padrão
    const adminExists = await db.get('SELECT id FROM users WHERE username = ?', ['admin']);
    if (!adminExists) {
        const hashedPassword = await bcrypt.hash('admin123', 10);
        await db.run(
            'INSERT INTO users (username, password, is_admin) VALUES (?, ?, ?)',
            ['admin', hashedPassword, true]
        );
    }
}

// Middleware de autenticação
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.sendStatus(401);

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
}

// Rotas de autenticação
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await db.get('SELECT * FROM users WHERE username = ?', [username]);

        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({ message: 'Usuário ou senha inválidos' });
        }

        const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET);
        res.json({ token });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erro no servidor' });
    }
});

// Rotas para funcionários
app.get('/api/employees', authenticateToken, async (req, res) => {
    try {
        const employees = await db.all('SELECT * FROM employees');
        
        // Verificar folgas do dia
        const today = new Date().toISOString().split('T')[0];
        for (let emp of employees) {
            const onLeave = await db.get(
                'SELECT * FROM leaves WHERE employee_id = ? AND date = ?',
                [emp.id, today]
            );
            emp.onLeave = !!onLeave;
        }
        
        res.json(employees);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erro ao buscar funcionários' });
    }
});

app.get('/api/employees/available', authenticateToken, async (req, res) => {
    try {
        const { date } = req.query;
        
        const employees = await db.all(`
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
        `, [date, date]);

        res.json(employees);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erro ao verificar disponibilidade' });
    }
});

app.post('/api/employees', authenticateToken, async (req, res) => {
    try {
        const { name } = req.body;
        const result = await db.run(
            'INSERT INTO employees (name) VALUES (?)',
            [name]
        );
        res.json({ id: result.lastID, name });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erro ao criar funcionário' });
    }
});

app.get('/api/employees/:id/leaves', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { month, year } = req.query;

        let query = 'SELECT * FROM leaves WHERE employee_id = ?';
        const params = [id];

        if (month && year) {
            query += ' AND strftime(\'%Y-%m\', date) = ?';
            params.push(`${year}-${month.padStart(2, '0')}`);
        }

        const leaves = await db.all(query, params);
        res.json(leaves);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erro ao buscar folgas do funcionário' });
    }
});

app.get('/api/employees/:id/tasks', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { date } = req.query;

        const tasks = await db.all(`
            SELECT t.*, e.name as employee_name 
            FROM tasks t
            LEFT JOIN employees e ON t.employee_id = e.id
            WHERE t.employee_id = ? AND (t.date = ? OR t.is_fixed = 1)
            ORDER BY t.priority DESC, t.is_fixed DESC
        `, [id, date]);

        res.json(tasks);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erro ao buscar tarefas do funcionário' });
    }
});

// Rota para excluir funcionário
app.delete('/api/employees/:id', authenticateToken, async (req, res) => {
    try {
        const employeeId = req.params.id;
        
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

        // Excluir funcionário
        const result = await db.run(
            'DELETE FROM employees WHERE id = ?',
            [employeeId]
        );

        if (result.changes === 0) {
            return res.status(404).json({ message: 'Funcionário não encontrado' });
        }

        res.json({ message: 'Funcionário excluído com sucesso' });
    } catch (error) {
        console.error('Erro ao excluir funcionário:', error);
        res.status(500).json({ message: 'Erro ao excluir funcionário' });
    }
});

// Rotas para tarefas
app.get('/api/tasks', authenticateToken, async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        const tasks = await db.all(
            'SELECT * FROM tasks WHERE date = ? OR is_fixed = 1',
            [today]
        );
        res.json(tasks);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erro ao buscar tarefas' });
    }
});

app.post('/api/tasks', authenticateToken, async (req, res) => {
    try {
        const { name, employeeId, isFixed = false } = req.body;
        const today = new Date().toISOString().split('T')[0];
        
        const result = await db.run(
            'INSERT INTO tasks (name, employee_id, date, is_fixed) VALUES (?, ?, ?, ?)',
            [name, employeeId, today, isFixed]
        );
        
        res.json({
            id: result.lastID,
            name,
            employeeId,
            date: today,
            isFixed
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erro ao criar tarefa' });
    }
});

app.delete('/api/tasks/:id', authenticateToken, async (req, res) => {
    try {
        await db.run('DELETE FROM tasks WHERE id = ?', [req.params.id]);
        res.json({ message: 'Tarefa excluída com sucesso' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erro ao excluir tarefa' });
    }
});

app.patch('/api/tasks/:id/status', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        await db.run(
            'UPDATE tasks SET status = ? WHERE id = ?',
            [status, id]
        );

        res.json({ message: 'Status atualizado com sucesso' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erro ao atualizar status' });
    }
});

// Rota para distribuição automática de tarefas
app.post('/api/tasks/distribute', authenticateToken, async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        
        // Buscar funcionários disponíveis (sem folga)
        const availableEmployees = await db.all(`
            SELECT e.* FROM employees e
            WHERE e.active = 1 AND e.id NOT IN (
                SELECT l.employee_id FROM leaves l
                WHERE l.date = ? AND l.type = 'folga'
            )
        `, [today]);

        if (availableEmployees.length === 0) {
            return res.status(400).json({ message: 'Não há funcionários disponíveis hoje' });
        }

        // Buscar tarefas não fixas e não atribuídas
        const tasks = await db.all(`
            SELECT * FROM tasks 
            WHERE date = ? 
            AND is_fixed = 0 
            AND employee_id IS NULL
            ORDER BY priority DESC
        `, [today]);

        // Buscar histórico recente de tarefas para cada funcionário
        const taskHistory = new Map();
        for (let emp of availableEmployees) {
            const history = await db.all(`
                SELECT t.name, th.date 
                FROM task_history th
                JOIN tasks t ON th.task_id = t.id
                WHERE th.employee_id = ?
                ORDER BY th.date DESC LIMIT 14
            `, [emp.id]);
            taskHistory.set(emp.id, history);
        }

        // Distribuir tarefas
        for (let task of tasks) {
            let bestEmployee = null;
            let bestScore = -1;

            for (let emp of availableEmployees) {
                const history = taskHistory.get(emp.id);
                let score = 100;

                // Reduzir score baseado em quantas vezes o funcionário fez a tarefa recentemente
                const recentTasks = history.filter(h => h.name === task.name).length;
                score -= recentTasks * 20;

                // Reduzir score baseado na quantidade de tarefas já atribuídas hoje
                const todayTasks = await db.all(`
                    SELECT COUNT(*) as count FROM tasks
                    WHERE employee_id = ? AND date = ?
                `, [emp.id, today]);
                score -= todayTasks[0].count * 10;

                if (score > bestScore) {
                    bestScore = score;
                    bestEmployee = emp;
                }
            }

            if (bestEmployee) {
                // Atribuir tarefa
                await db.run(
                    'UPDATE tasks SET employee_id = ? WHERE id = ?',
                    [bestEmployee.id, task.id]
                );

                // Registrar no histórico
                await db.run(
                    'INSERT INTO task_history (task_id, employee_id, date) VALUES (?, ?, ?)',
                    [task.id, bestEmployee.id, today]
                );
            }
        }

        res.json({ message: 'Tarefas distribuídas com sucesso' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erro ao distribuir tarefas' });
    }
});

// Rotas para tarefas fixas
app.get('/api/tasks/fixed', authenticateToken, async (req, res) => {
    try {
        const tasks = await db.all('SELECT * FROM tasks WHERE is_fixed = 1');
        res.json(tasks);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erro ao buscar tarefas fixas' });
    }
});

app.post('/api/tasks/fixed', authenticateToken, async (req, res) => {
    try {
        const { name, employeeId } = req.body;
        
        // Verificar se já existe uma tarefa fixa para este funcionário
        const existingTask = await db.get(
            'SELECT * FROM tasks WHERE name = ? AND is_fixed = 1',
            [name]
        );

        if (existingTask) {
            return res.status(400).json({ message: 'Tarefa fixa já existe' });
        }

        const result = await db.run(
            'INSERT INTO tasks (name, employee_id, is_fixed) VALUES (?, ?, 1)',
            [name, employeeId]
        );

        res.json({
            id: result.lastID,
            name,
            employeeId,
            isFixed: true
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erro ao criar tarefa fixa' });
    }
});

// Rotas para folgas
app.get('/api/leaves', authenticateToken, async (req, res) => {
    try {
        const leaves = await db.all(`
            SELECT l.*, e.name as employee_name 
            FROM leaves l
            JOIN employees e ON l.employee_id = e.id
        `);
        res.json(leaves);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erro ao buscar folgas' });
    }
});

app.delete('/api/leaves/:id', authenticateToken, async (req, res) => {
    try {
        await db.run('DELETE FROM leaves WHERE id = ?', [req.params.id]);
        res.json({ message: 'Folga removida com sucesso' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erro ao remover folga' });
    }
});

// Rota para relatórios
app.get('/api/reports', authenticateToken, async (req, res) => {
    try {
        const { type, date } = req.query;
        let startDate, endDate;

        // Definir período do relatório
        switch (type) {
            case 'daily':
                startDate = new Date(date);
                endDate = new Date(date);
                break;
            case 'weekly':
                startDate = new Date(date);
                startDate.setDate(startDate.getDate() - startDate.getDay());
                endDate = new Date(startDate);
                endDate.setDate(endDate.getDate() + 6);
                break;
            case 'monthly':
                startDate = new Date(date.substring(0, 7) + '-01');
                endDate = new Date(startDate);
                endDate.setMonth(endDate.getMonth() + 1);
                endDate.setDate(endDate.getDate() - 1);
                break;
        }

        // Buscar dados para o relatório
        const tasks = await db.all(`
            SELECT t.*, e.name as employee_name
            FROM tasks t
            JOIN employees e ON t.employee_id = e.id
            WHERE t.date BETWEEN ? AND ?
        `, [startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0]]);

        const leaves = await db.all(`
            SELECT l.*, e.name as employee_name
            FROM leaves l
            JOIN employees e ON l.employee_id = e.id
            WHERE l.date BETWEEN ? AND ?
        `, [startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0]]);

        // Processar estatísticas
        const employeeStats = {};
        const taskStats = {};

        tasks.forEach(task => {
            // Estatísticas por funcionário
            if (!employeeStats[task.employee_id]) {
                employeeStats[task.employee_id] = {
                    employeeName: task.employee_name,
                    tasksCompleted: 0,
                    leaves: 0,
                    completionRate: 0
                };
            }
            employeeStats[task.employee_id].tasksCompleted++;

            // Estatísticas por tarefa
            if (!taskStats[task.name]) {
                taskStats[task.name] = {
                    taskName: task.name,
                    frequency: 0,
                    employees: new Set()
                };
            }
            taskStats[task.name].frequency++;
            taskStats[task.name].employees.add(task.employee_name);
        });

        // Adicionar folgas às estatísticas
        leaves.forEach(leave => {
            if (employeeStats[leave.employee_id]) {
                employeeStats[leave.employee_id].leaves++;
            }
        });

        // Calcular taxas de conclusão
        Object.values(employeeStats).forEach(stat => {
            const workDays = Math.floor((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
            stat.completionRate = ((stat.tasksCompleted / (workDays - stat.leaves)) * 100).toFixed(1);
        });

        res.json({
            startDate: startDate.toISOString().split('T')[0],
            endDate: endDate.toISOString().split('T')[0],
            employeeStats: Object.values(employeeStats),
            taskStats: Object.values(taskStats).map(stat => ({
                ...stat,
                employees: Array.from(stat.employees)
            }))
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erro ao gerar relatório' });
    }
});

// Rotas para folgas
app.post('/api/leaves', authenticateToken, async (req, res) => {
    try {
        const { employeeId, date } = req.body;
        
        const result = await db.run(
            'INSERT INTO leaves (employee_id, date) VALUES (?, ?)',
            [employeeId, date]
        );
        
        res.json({
            id: result.lastID,
            employeeId,
            date
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erro ao registrar folga' });
    }
});

app.get('/api/leaves/:employeeId', authenticateToken, async (req, res) => {
    try {
        const leaves = await db.all(
            'SELECT * FROM leaves WHERE employee_id = ?',
            [req.params.employeeId]
        );
        res.json(leaves);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erro ao buscar folgas' });
    }
});

// Inicialização do servidor
const PORT = process.env.PORT || 5239;

async function startServer() {
    try {
        await initializeDb();
        app.listen(PORT, () => {
            console.log(`Servidor rodando na porta ${PORT}`);
        });
    } catch (error) {
        console.error('Erro ao iniciar servidor:', error);
        process.exit(1);
    }
}

startServer();