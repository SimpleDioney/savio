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

    // Primeiro, verificar se as colunas work_start e work_end existem
    try {
        const tableInfo = await db.all("PRAGMA table_info(employees)");
        const hasWorkStart = tableInfo.some(col => col.name === 'work_start');
        const hasWorkEnd = tableInfo.some(col => col.name === 'work_end');

        // Criar tabelas base
        await db.exec(`
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                is_admin BOOLEAN DEFAULT FALSE,
                employee_id INTEGER,
                FOREIGN KEY (employee_id) REFERENCES employees (id)
            );

            CREATE TABLE IF NOT EXISTS employees (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                active BOOLEAN DEFAULT TRUE
            );

            CREATE TABLE IF NOT EXISTS tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT,
                description TEXT,
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

        // Adicionar colunas de horário apenas se não existirem
        if (!hasWorkStart) {
            await db.exec('ALTER TABLE employees ADD COLUMN work_start TEXT DEFAULT "08:00"');
        }
        if (!hasWorkEnd) {
            await db.exec('ALTER TABLE employees ADD COLUMN work_end TEXT DEFAULT "16:20"');
        }

        // Criar usuário admin padrão se não existir
        const adminExists = await db.get('SELECT id FROM users WHERE username = ?', ['admin']);
        
        if (!adminExists) {
            const hashedPassword = await bcrypt.hash('admin123', 10);
            await db.run(
                'INSERT INTO users (username, password, is_admin) VALUES (?, ?, ?)',
                ['admin', hashedPassword, true]
            );
        }

    } catch (error) {
        console.error('Erro na inicialização do banco de dados:', error);
        throw error;
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
        
        if (!username || !password) {
            return res.status(400).json({ 
                message: 'Usuário e senha são obrigatórios' 
            });
        }

        const user = await db.get(`
            SELECT u.*, e.name as employee_name 
            FROM users u 
            LEFT JOIN employees e ON u.employee_id = e.id 
            WHERE u.username = ?
        `, [username]);

        if (!user) {
            return res.status(401).json({ 
                message: 'Usuário ou senha inválidos' 
            });
        }

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(401).json({ 
                message: 'Usuário ou senha inválidos' 
            });
        }

        const token = jwt.sign({ 
            id: user.id, 
            username: user.username,
            isAdmin: user.is_admin,
            employeeId: user.employee_id,
            employeeName: user.name || user.username // Fallback para username se name não existir
        }, JWT_SECRET);

        res.json({ 
            token,
            isAdmin: user.is_admin,
            employeeName: user.name || user.username
        });
    } catch (error) {
        console.error('Erro no login:', error);
        res.status(500).json({ message: 'Erro ao realizar login' });
    }
});
// Rotas para funcionários
app.post('/api/employees', authenticateToken, async (req, res) => {
    try {
        const { name, username, password } = req.body;
        
        if (!name || !username || !password) {
            return res.status(400).json({ 
                message: 'Nome, usuário e senha são obrigatórios' 
            });
        }

        // Iniciar transação
        await db.run('BEGIN TRANSACTION');

        try {
            // Verificar se usuário já existe
            const existingUser = await db.get(
                'SELECT id FROM users WHERE username = ?',
                [username]
            );

            if (existingUser) {
                await db.run('ROLLBACK');
                return res.status(400).json({ 
                    message: 'Nome de usuário já existe' 
                });
            }
            
            // Inserir funcionário
            const empResult = await db.run(
                'INSERT INTO employees (name, active) VALUES (?, ?)',
                [name, true]
            );
            
            // Criar hash da senha
            const hashedPassword = await bcrypt.hash(password, 10);
            
            // Criar usuário para o funcionário
            await db.run(
                'INSERT INTO users (username, password, is_admin, employee_id) VALUES (?, ?, ?, ?)',
                [username, hashedPassword, false, empResult.lastID]
            );
            
            await db.run('COMMIT');
            
            res.json({ 
                id: empResult.lastID, 
                name,
                username,
                message: 'Funcionário criado com sucesso'
            });
        } catch (error) {
            await db.run('ROLLBACK');
            throw error;
        }
    } catch (error) {
        console.error('Erro ao criar funcionário:', error);
        res.status(500).json({ 
            message: 'Erro ao criar funcionário' 
        });
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

app.get('/api/employees', authenticateToken, async (req, res) => {
    try {
        const employees = await db.all(`
            SELECT 
                e.*,
                u.username,
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
            WHERE e.active = 1
            ORDER BY e.name
        `);
        
        res.json(employees);
    } catch (error) {
        console.error('Erro ao buscar funcionários:', error);
        res.status(500).json({ message: 'Erro ao buscar funcionários' });
    }
});


app.get('/api/users/check/:username', authenticateToken, async (req, res) => {
    try {
        const { username } = req.params;
        const user = await db.get(
            'SELECT id FROM users WHERE username = ?',
            [username]
        );
        
        res.json({ exists: !!user });
    } catch (error) {
        console.error('Erro ao verificar usuário:', error);
        res.status(500).json({ 
            message: 'Erro ao verificar usuário' 
        });
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

app.put('/api/employees/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { name, username, password, workStart, workEnd } = req.body;

        await db.run('BEGIN TRANSACTION');

        try {
            // Atualizar informações básicas do funcionário
            await db.run(
                'UPDATE employees SET name = ?, work_start = ?, work_end = ? WHERE id = ?',
                [name, workStart || '09:00', workEnd || '18:00', id]
            );

            // Se fornecido username ou password, atualizar usuário
            if (username || password) {
                let query = 'UPDATE users SET';
                const params = [];

                if (username) {
                    query += ' username = ?';
                    params.push(username);
                }

                if (password) {
                    const hashedPassword = await bcrypt.hash(password, 10);
                    query += username ? ', password = ?' : ' password = ?';
                    params.push(hashedPassword);
                }

                query += ' WHERE employee_id = ?';
                params.push(id);

                await db.run(query, params);
            }

            await db.run('COMMIT');
            res.json({ message: 'Funcionário atualizado com sucesso' });
        } catch (error) {
            await db.run('ROLLBACK');
            throw error;
        }
    } catch (error) {
        console.error('Erro ao atualizar funcionário:', error);
        res.status(500).json({ message: 'Erro ao atualizar funcionário' });
    }
});

app.get('/api/employees/:id/working-status', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const employee = await db.get(
            'SELECT work_start, work_end FROM employees WHERE id = ?',
            [id]
        );

        if (!employee) {
            return res.status(404).json({ message: 'Funcionário não encontrado' });
        }

        const now = new Date();
        const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
        
        const isWithinHours = currentTime >= employee.work_start && currentTime <= employee.work_end;

        res.json({ 
            isWorking: isWithinHours,
            workStart: employee.work_start,
            workEnd: employee.work_end
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erro ao verificar status de trabalho' });
    }
});

// Rotas para tarefas
app.get('/api/tasks', authenticateToken, async (req, res) => {
    try {
        const { date, status } = req.query;
        const selectedDate = date || new Date().toISOString().split('T')[0];

        let query = `
            SELECT t.*,
                   e.name as employee_name,
                   COALESCE(fts.status, 
                       CASE WHEN t.is_fixed = 1 THEN 'pendente' ELSE t.status END
                   ) as status
            FROM tasks t
            LEFT JOIN employees e ON t.employee_id = e.id
            LEFT JOIN fixed_task_status fts ON t.id = fts.task_id 
                AND fts.date = ?
            WHERE (t.date = ? OR t.is_fixed = 1)
        `;
        const params = [selectedDate, selectedDate];

        if (status) {
            query += ` AND (
                CASE 
                    WHEN t.is_fixed = 1 THEN COALESCE(fts.status, 'pendente')
                    ELSE t.status 
                END
            ) = ?`;
            params.push(status);
        }

        const tasks = await db.all(query, params);
        res.json(tasks);
    } catch (error) {
        console.error('Erro ao buscar tarefas:', error);
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
        const { id } = req.params;
        
        // Verificar se a tarefa existe
        const task = await db.get('SELECT * FROM tasks WHERE id = ?', [id]);
        if (!task) {
            return res.status(404).json({ message: 'Tarefa não encontrada' });
        }

        // Se for admin, pode deletar qualquer tarefa (fixa ou não)
        if (req.user.isAdmin) {
            // Se for uma tarefa fixa, deletar também os status históricos
            if (task.is_fixed) {
                await db.run('BEGIN TRANSACTION');
                try {
                    // Deletar registros de status da tarefa fixa
                    await db.run('DELETE FROM fixed_task_status WHERE task_id = ?', [id]);
                    // Deletar registros do histórico
                    await db.run('DELETE FROM task_history WHERE task_id = ?', [id]);
                    // Deletar a tarefa
                    await db.run('DELETE FROM tasks WHERE id = ?', [id]);
                    await db.run('COMMIT');
                } catch (error) {
                    await db.run('ROLLBACK');
                    throw error;
                }
            } else {
                // Para tarefas não fixas, apenas deletar a tarefa
                await db.run('DELETE FROM tasks WHERE id = ?', [id]);
            }
            
            return res.json({ message: 'Tarefa excluída com sucesso' });
        }

        // Para não-admin, verificar se é uma tarefa fixa
        if (task.is_fixed) {
            return res.status(403).json({ 
                message: 'Apenas administradores podem excluir tarefas fixas' 
            });
        }

        // Para não-admin, verificar se é a própria tarefa e se está no horário
        if (task.employee_id !== req.user.employeeId) {
            return res.status(403).json({ 
                message: 'Sem permissão para excluir esta tarefa' 
            });
        }

        // Verificar horário de trabalho do funcionário
        const employee = await db.get(
            'SELECT work_start, work_end FROM employees WHERE id = ?',
            [req.user.employeeId]
        );

        const now = new Date();
        const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
        
        if (currentTime < employee.work_start || currentTime > employee.work_end) {
            return res.status(403).json({ 
                message: 'Você só pode excluir tarefas durante seu horário de trabalho' 
            });
        }

        // Deletar a tarefa
        await db.run('DELETE FROM tasks WHERE id = ?', [id]);
        res.json({ message: 'Tarefa excluída com sucesso' });

    } catch (error) {
        console.error('Erro ao excluir tarefa:', error);
        res.status(500).json({ message: 'Erro ao excluir tarefa' });
    }
});

app.patch('/api/tasks/:id/status', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { status, date } = req.body;

        // Verificar se a tarefa existe
        const task = await db.get('SELECT * FROM tasks WHERE id = ?', [id]);
        if (!task) {
            return res.status(404).json({ message: 'Tarefa não encontrada' });
        }

        // Permitir que admins atualizem qualquer tarefa e funcionários atualizem suas próprias tarefas
        if (!req.user.isAdmin && task.employee_id !== req.user.employeeId) {
            return res.status(403).json({ 
                message: 'Sem permissão para atualizar esta tarefa' 
            });
        }

        if (task.is_fixed) {
            // Para tarefas fixas, atualizar ou inserir status do dia
            const currentDate = date || new Date().toISOString().split('T')[0];
            
            await db.run(`
                INSERT INTO fixed_task_status (task_id, date, status)
                VALUES (?, ?, ?)
                ON CONFLICT (task_id, date) 
                DO UPDATE SET status = ?
            `, [id, currentDate, status, status]);
        } else {
            // Para tarefas normais
            await db.run('UPDATE tasks SET status = ? WHERE id = ?', [status, id]);
        }

        res.json({ message: 'Status atualizado com sucesso' });
    } catch (error) {
        console.error('Erro ao atualizar status:', error);
        res.status(500).json({ message: 'Erro ao atualizar status' });
    }
});

app.get('/api/tasks/fixed/history', authenticateToken, async (req, res) => {
    try {
        const { start, end } = req.query;
        
        const history = await db.all(`
            SELECT t.name as task_name, 
                   e.name as employee_name,
                   fts.date,
                   fts.status
            FROM fixed_task_status fts
            JOIN tasks t ON fts.task_id = t.id
            JOIN employees e ON t.employee_id = e.id
            WHERE fts.date BETWEEN ? AND ?
            ORDER BY fts.date DESC, t.name
        `, [start, end]);

        res.json(history);
    } catch (error) {
        console.error('Erro ao buscar histórico:', error);
        res.status(500).json({ message: 'Erro ao buscar histórico' });
    }
});

// Rota para distribuição automática de tarefas
app.post('/api/tasks/distribute', authenticateToken, async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        const now = new Date();
        const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
        
        // Buscar funcionários disponíveis (sem folga e dentro do horário de trabalho)
        const availableEmployees = await db.all(`
            SELECT e.* FROM employees e
            WHERE e.active = 1 
            AND e.id NOT IN (
                SELECT l.employee_id FROM leaves l
                WHERE l.date = ? AND l.type = 'folga'
            )
            AND time(?) BETWEEN time(e.work_start) AND time(e.work_end)
        `, [today, currentTime]);

        if (availableEmployees.length === 0) {
            return res.status(400).json({ message: 'Não há funcionários disponíveis agora' });
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
        const { month, year, employeeId } = req.query;
        let query = `
            SELECT l.*, e.name as employee_name 
            FROM leaves l
            JOIN employees e ON l.employee_id = e.id
            WHERE 1=1
        `;
        const params = [];

        if (month && year) {
            query += ` AND strftime('%Y-%m', l.date) = ?`;
            params.push(`${year}-${month.padStart(2, '0')}`);
        }

        if (employeeId) {
            query += ` AND l.employee_id = ?`;
            params.push(employeeId);
        }

        const leaves = await db.all(query, params);
        res.json(leaves);
    } catch (error) {
        console.error('Erro ao buscar folgas:', error);
        res.status(500).json({ message: 'Erro ao buscar folgas' });
    }
});


app.delete('/api/leaves/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        
        // Verificar se a folga existe
        const leave = await db.get('SELECT * FROM leaves WHERE id = ?', [id]);
        if (!leave) {
            return res.status(404).json({ message: 'Folga não encontrada' });
        }

        // Apenas admin pode remover folgas
        if (!req.user.isAdmin) {
            return res.status(403).json({ message: 'Permissão negada' });
        }

        await db.run('DELETE FROM leaves WHERE id = ?', [id]);
        
        res.json({ message: 'Folga removida com sucesso' });
    } catch (error) {
        console.error('Erro ao remover folga:', error);
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
            default:
                return res.status(400).json({ message: 'Tipo de relatório inválido' });
        }

        // Construir a query base de acordo com as permissões
        const baseTaskQuery = req.user.isAdmin ? `
            SELECT t.*, e.name as employee_name, u.username
            FROM tasks t
            JOIN employees e ON t.employee_id = e.id
            LEFT JOIN users u ON e.id = u.employee_id
            WHERE t.date BETWEEN ? AND ?
        ` : `
            SELECT t.*, e.name as employee_name, u.username
            FROM tasks t
            JOIN employees e ON t.employee_id = e.id
            LEFT JOIN users u ON e.id = u.employee_id
            WHERE t.date BETWEEN ? AND ?
            AND t.employee_id = ?
        `;

        // Parâmetros da query
        const queryParams = req.user.isAdmin ? 
            [startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0]] :
            [startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0], req.user.employeeId];

        // Buscar tarefas
        const tasks = await db.all(baseTaskQuery, queryParams);

        // Buscar folgas para o período
        const leavesQuery = req.user.isAdmin ? `
            SELECT l.*, e.name as employee_name
            FROM leaves l
            JOIN employees e ON l.employee_id = e.id
            WHERE l.date BETWEEN ? AND ?
        ` : `
            SELECT l.*, e.name as employee_name
            FROM leaves l
            JOIN employees e ON l.employee_id = e.id
            WHERE l.date BETWEEN ? AND ?
            AND l.employee_id = ?
        `;

        const leaves = await db.all(leavesQuery, queryParams);

        // Processar estatísticas
        const employeeStats = {};
        const taskStats = {};
        const totalDays = Math.floor((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;

        // Inicializar estatísticas por funcionário
        tasks.forEach(task => {
            if (!employeeStats[task.employee_id]) {
                employeeStats[task.employee_id] = {
                    employeeId: task.employee_id,
                    employeeName: task.employee_name,
                    username: task.username,
                    tasksTotal: 0,
                    tasksCompleted: 0,
                    tasksPending: 0,
                    tasksInProgress: 0,
                    leaves: 0,
                    completionRate: 0,
                    avgTasksPerDay: 0
                };
            }

            employeeStats[task.employee_id].tasksTotal++;
            
            switch (task.status) {
                case 'concluido':
                    employeeStats[task.employee_id].tasksCompleted++;
                    break;
                case 'pendente':
                    employeeStats[task.employee_id].tasksPending++;
                    break;
                case 'em-andamento':
                    employeeStats[task.employee_id].tasksInProgress++;
                    break;
            }

            // Estatísticas por tarefa
            if (!taskStats[task.name]) {
                taskStats[task.name] = {
                    taskName: task.name,
                    frequency: 0,
                    completionRate: 0,
                    totalAssigned: 0,
                    completedCount: 0,
                    employees: new Set(),
                    isFixed: task.is_fixed
                };
            }

            taskStats[task.name].frequency++;
            taskStats[task.name].totalAssigned++;
            if (task.status === 'concluido') {
                taskStats[task.name].completedCount++;
            }
            taskStats[task.name].employees.add(task.employee_name);
        });

        // Adicionar folgas às estatísticas
        leaves.forEach(leave => {
            if (employeeStats[leave.employee_id]) {
                employeeStats[leave.employee_id].leaves++;
            }
        });

        // Calcular taxas finais e médias
        Object.values(employeeStats).forEach(stat => {
            // Dias úteis = total de dias - folgas
            const workDays = totalDays - stat.leaves;
            
            // Taxa de conclusão baseada apenas nas tarefas atribuídas
            stat.completionRate = stat.tasksTotal > 0 ?
                ((stat.tasksCompleted / stat.tasksTotal) * 100).toFixed(1) : '0.0';
            
            // Média de tarefas por dia útil
            stat.avgTasksPerDay = workDays > 0 ?
                (stat.tasksTotal / workDays).toFixed(1) : '0.0';
        });

        // Calcular taxas de conclusão por tarefa
        Object.values(taskStats).forEach(stat => {
            stat.completionRate = stat.totalAssigned > 0 ?
                ((stat.completedCount / stat.totalAssigned) * 100).toFixed(1) : '0.0';
            stat.employees = Array.from(stat.employees);
        });

        // Preparar resposta
        const response = {
            period: {
                start: startDate.toISOString().split('T')[0],
                end: endDate.toISOString().split('T')[0],
                totalDays: totalDays
            },
            summary: {
                totalTasks: tasks.length,
                totalCompleted: tasks.filter(t => t.status === 'concluido').length,
                totalPending: tasks.filter(t => t.status === 'pendente').length,
                totalInProgress: tasks.filter(t => t.status === 'em-andamento').length,
                totalLeaves: leaves.length
            },
            employeeStats: Object.values(employeeStats),
            taskStats: Object.values(taskStats)
        };

        res.json(response);
    } catch (error) {
        console.error('Erro ao gerar relatório:', error);
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