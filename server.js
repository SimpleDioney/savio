const express = require("express");
const sqlite3 = require("sqlite3");
const { open } = require("sqlite");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const path = require("path");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const JWT_SECRET = "seu_secret_key_aqui";
let db;

// Inicialização do banco de dados
async function initializeDb() {
    db = await open({
        filename: './database.sqlite',
        driver: sqlite3.Database
    });

    try {
        // Verificar se as colunas existem
        const tableInfo = await db.all("PRAGMA table_info(employees)");
        const hasWorkStart = tableInfo.some(col => col.name === 'work_start');
        const hasWorkEnd = tableInfo.some(col => col.name === 'work_end');
        const hasStoreId = tableInfo.some(col => col.name === 'store_id');
        const hasAlternativeSchedule = tableInfo.some(col => col.name === 'alternative_schedule');

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
                ${!hasStoreId ? ', store_id INTEGER REFERENCES stores(id)' : ''}
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
                store_id INTEGER,
                FOREIGN KEY (employee_id) REFERENCES employees (id),
                FOREIGN KEY (store_id) REFERENCES stores(id)
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

            CREATE TABLE IF NOT EXISTS stores (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                address TEXT,
                phone TEXT,
                active BOOLEAN DEFAULT TRUE,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS fixed_task_status (
                task_id INTEGER,
                date TEXT,
                status TEXT DEFAULT 'pendente',
                PRIMARY KEY (task_id, date),
                FOREIGN KEY (task_id) REFERENCES tasks (id)
            );

            CREATE TABLE IF NOT EXISTS leave_requests (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                employee_id INTEGER NOT NULL,
                status TEXT DEFAULT 'pending',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (employee_id) REFERENCES employees (id)
            );

            CREATE TABLE IF NOT EXISTS leave_request_dates (
                request_id INTEGER,
                date TEXT NOT NULL,
                PRIMARY KEY (request_id, date),
                FOREIGN KEY (request_id) REFERENCES leave_requests (id)
            );

            CREATE TABLE IF NOT EXISTS employees (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                active BOOLEAN DEFAULT TRUE,
                store_id INTEGER REFERENCES stores(id),
                work_start TEXT DEFAULT "08:00",
                work_end TEXT DEFAULT "16:20",
                alternative_schedule TEXT
            );
        `);

        if (!hasAlternativeSchedule) {
            try {
                await db.exec('ALTER TABLE employees ADD COLUMN alternative_schedule TEXT');
            } catch (e) {
                console.log('Coluna alternative_schedule já existe ou outro erro:', e.message);
            }
        }

        // Adicionar store_id se não existir
        if (!hasStoreId) {
            try {
                await db.exec('ALTER TABLE employees ADD COLUMN store_id INTEGER REFERENCES stores(id)');
            } catch (e) {
                // Ignora erro se a coluna já existir
                console.log('Coluna store_id já existe ou outro erro:', e.message);
            }
        }

        // Criar índice se não existir
        try {
            await db.exec('CREATE INDEX IF NOT EXISTS idx_employees_store ON employees(store_id)');
        } catch (e) {
            console.log('Índice já existe ou outro erro:', e.message);
        }
        
        // Adicionar colunas de horário se não existirem
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
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) return res.sendStatus(401);

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
}

// Rotas de autenticação
app.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        message: "Usuário e senha são obrigatórios",
      });
    }

    const user = await db.get(
      `
            SELECT u.*, e.name as employee_name 
            FROM users u 
            LEFT JOIN employees e ON u.employee_id = e.id 
            WHERE u.username = ?
        `,
      [username]
    );

    if (!user) {
      return res.status(401).json({
        message: "Usuário ou senha inválidos",
      });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({
        message: "Usuário ou senha inválidos",
      });
    }

    const token = jwt.sign(
      {
        id: user.id,
        username: user.username,
        isAdmin: user.is_admin,
        employeeId: user.employee_id,
        employeeName: user.name || user.username, // Fallback para username se name não existir
      },
      JWT_SECRET
    );

    res.json({
      token,
      isAdmin: user.is_admin,
      employeeName: user.name || user.username,
    });
  } catch (error) {
    console.error("Erro no login:", error);
    res.status(500).json({ message: "Erro ao realizar login" });
  }
});
// Rotas para funcionários
app.post('/api/employees', authenticateToken, async (req, res) => {
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

        await db.run('BEGIN TRANSACTION');

        try {
            // Inserir funcionário com horário alternativo
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
            
            const hashedPassword = await bcrypt.hash(password, 10);
            
            // Criar usuário
            await db.run(
                'INSERT INTO users (username, password, is_admin, employee_id) VALUES (?, ?, ?, ?)',
                [username, hashedPassword, false, empResult.lastID]
            );
            
            await db.run('COMMIT');
            
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
            
            res.json({ 
                ...newEmployee,
                message: 'Funcionário criado com sucesso'
            });
        } catch (error) {
            await db.run('ROLLBACK');
            throw error;
        }
    } catch (error) {
        console.error('Erro ao criar funcionário:', error);
        res.status(500).json({ 
            message: 'Erro ao criar funcionário',
            error: error.message
        });
    }
});

app.get("/api/employees/available", authenticateToken, async (req, res) => {
  try {
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
    console.error(error);
    res.status(500).json({ message: "Erro ao verificar disponibilidade" });
  }
});

app.get('/api/employees', authenticateToken, async (req, res) => {
    try {
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
        console.error('Erro ao buscar funcionários:', error);
        res.status(500).json({ message: 'Erro ao buscar funcionários' });
    }
});

app.get("/api/users/check/:username", authenticateToken, async (req, res) => {
  try {
    const { username } = req.params;
    const user = await db.get("SELECT id FROM users WHERE username = ?", [
      username,
    ]);

    res.json({ exists: !!user });
  } catch (error) {
    console.error("Erro ao verificar usuário:", error);
    res.status(500).json({
      message: "Erro ao verificar usuário",
    });
  }
});

app.get("/api/employees/:id/leaves", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
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
    console.error(error);
    res.status(500).json({ message: "Erro ao buscar folgas do funcionário" });
  }
});

app.get('/api/employees/:id/tasks', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
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
        console.error('Erro ao buscar tarefas:', error);
        res.status(500).json({ message: 'Erro ao buscar tarefas' });
    }
});


// Rotas para pedir folga

// Buscar solicitações de folga
app.get('/api/leave-requests', authenticateToken, async (req, res) => {
    try {
        const { month } = req.query;
        
        // Se não houver mês específico, usar mês atual
        let year, monthNum;
        if (!month) {
            const now = new Date();
            year = now.getFullYear();
            monthNum = String(now.getMonth() + 1).padStart(2, '0');
        } else {
            [year, monthNum] = month.split('-');
        }
        
        // Construir consulta SQL base - Adicionado WHERE lr.status = 'pending'
        let query = `
            SELECT 
                lr.id,
                lr.employee_id,
                lr.status,
                lr.created_at,
                lrd.date,
                e.name as employee_name
            FROM leave_requests lr
            JOIN leave_request_dates lrd ON lr.id = lrd.request_id
            JOIN employees e ON lr.employee_id = e.id
            WHERE strftime('%Y-%m', lrd.date) = ?
            AND lr.status = 'pending'  
        `;
        
        const params = [`${year}-${monthNum}`];

        // Se não for admin, mostrar apenas as próprias solicitações
        if (!req.user.isAdmin) {
            query += ' AND lr.employee_id = ?';
            params.push(req.user.employeeId);
        }

        // Ordenar por data de criação
        query += ' ORDER BY lr.created_at DESC';

        const requests = await db.all(query, params);
        
        // Agrupar datas por solicitação
        const groupedRequests = requests.reduce((acc, curr) => {
            if (!acc[curr.id]) {
                acc[curr.id] = {
                    id: curr.id,
                    employeeId: curr.employee_id,
                    employeeName: curr.employee_name,
                    status: curr.status,
                    createdAt: curr.created_at,
                    dates: []
                };
            }
            acc[curr.id].dates.push(curr.date);
            return acc;
        }, {});

        const requestsList = Object.values(groupedRequests);
        
        // Mandar resposta vazia caso não haja solicitações pendentes
        if (requestsList.length === 0) {
            return res.json([]);
        }

        res.json(requestsList);
    } catch (error) {
        console.error('Erro ao buscar solicitações:', error);
        res.status(500).json({ message: 'Erro ao buscar solicitações' });
    }
});

// Criar nova solicitação de folga
app.post('/api/leave-requests', authenticateToken, async (req, res) => {
    try {
        const { dates } = req.body;

        // Verificar se as datas são válidas (sábado e domingo consecutivos)
        if (!dates || dates.length !== 2) {
            return res.status(400).json({ message: 'Selecione um sábado e domingo consecutivos' });
        }

        // Verificar se já existe solicitação para estas datas
        const existingRequests = await db.get(
            'SELECT COUNT(*) as count FROM leave_request_dates WHERE date IN (?, ?)',
            dates
        );

        if (existingRequests.count > 0) {
            return res.status(400).json({ message: 'Já existe uma solicitação para estas datas' });
        }

        await db.run('BEGIN TRANSACTION');

        try {
            // Criar a solicitação com status pending
            const result = await db.run(
                'INSERT INTO leave_requests (employee_id, status) VALUES (?, ?)',
                [req.user.employeeId, 'pending']
            );

            // Inserir as datas
            for (const date of dates) {
                await db.run(
                    'INSERT INTO leave_request_dates (request_id, date) VALUES (?, ?)',
                    [result.lastID, date]
                );
            }

            await db.run('COMMIT');

            res.json({
                message: 'Solicitação criada com sucesso',
                requestId: result.lastID
            });
        } catch (error) {
            await db.run('ROLLBACK');
            throw error;
        }
    } catch (error) {
        console.error('Erro ao criar solicitação:', error);
        res.status(500).json({ message: 'Erro ao criar solicitação' });
    }
});

// Aprovar/rejeitar solicitação (apenas admin)
app.post('/api/leave-requests/:id/:action', authenticateToken, async (req, res) => {
    if (!req.user.isAdmin) {
        return res.status(403).json({ message: 'Apenas administradores podem aprovar/rejeitar solicitações' });
    }

    try {
        const { id, action } = req.params;
        
        if (action !== 'approve' && action !== 'reject') {
            return res.status(400).json({ message: 'Ação inválida' });
        }

        await db.run('BEGIN TRANSACTION');

        try {
            // Obter a solicitação e suas datas antes de processar a ação
            const request = await db.get(
                'SELECT employee_id FROM leave_requests WHERE id = ?',
                [id]
            );

            const dates = await db.all(
                'SELECT date FROM leave_request_dates WHERE request_id = ?',
                [id]
            );

            if (action === 'approve') {
                // Se aprovada, atualiza o status e insere as folgas
                await db.run(
                    'UPDATE leave_requests SET status = "approved" WHERE id = ?',
                    [id]
                );
            
                for (const { date } of dates) {
                    await db.run(
                        'INSERT INTO leaves (employee_id, date) VALUES (?, ?)',
                        [request.employee_id, date]
                    );
                }
                        
            } else if (action === 'reject') {
                // Se rejeitada, exclui a solicitação e as datas associadas
                await db.run('DELETE FROM leave_request_dates WHERE request_id = ?', [id]);
                await db.run('DELETE FROM leave_requests WHERE id = ?', [id]);
            }

            await db.run('COMMIT');
            res.json({ 
                message: `Solicitação ${action === 'approve' ? 'aprovada' : 'rejeitada e excluída'} com sucesso`,
                dates: dates.map(d => d.date)
            });
        } catch (error) {
            await db.run('ROLLBACK');
            throw error;
        }
    } catch (error) {
        console.error('Erro ao processar solicitação:', error);
        res.status(500).json({ message: 'Erro ao processar solicitação' });
    }
});

// Rota para excluir funcionário
app.delete('/api/employees/:id', authenticateToken, async (req, res) => {
    try {
        const employeeId = req.params.id;
        
        // Iniciar transação
        await db.run('BEGIN TRANSACTION');

        try {
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

            await db.run('COMMIT');

            if (result.changes === 0) {
                return res.status(404).json({ message: 'Funcionário não encontrado' });
            }

            res.json({ message: 'Funcionário excluído com sucesso' });
        } catch (error) {
            await db.run('ROLLBACK');
            throw error;
        }
    } catch (error) {
        console.error('Erro ao excluir funcionário:', error);
        res.status(500).json({ message: 'Erro ao excluir funcionário' });
    }
});

app.put("/api/employees/:id", authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { 
            name, 
            username, 
            password, 
            workStart, 
            workEnd,
            alternativeSchedule 
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

        await db.run("BEGIN TRANSACTION");

        try {
            // Atualizar informações do funcionário
            await db.run(
                `UPDATE employees 
                 SET name = ?, 
                     work_start = ?, 
                     work_end = ?,
                     alternative_schedule = ?
                 WHERE id = ?`,
                [
                    name,
                    workStart || "09:00",
                    workEnd || "18:00",
                    alternativeSchedule ? JSON.stringify(alternativeSchedule) : null,
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
                    const hashedPassword = await bcrypt.hash(password, 10);
                    query += username ? ", password = ?" : " password = ?";
                    params.push(hashedPassword);
                }

                query += " WHERE employee_id = ?";
                params.push(id);

                await db.run(query, params);
            }

            await db.run("COMMIT");

            // Buscar funcionário atualizado
            const updatedEmployee = await db.get(
                `SELECT 
                    e.*, 
                    u.username 
                 FROM employees e 
                 LEFT JOIN users u ON e.id = u.employee_id 
                 WHERE e.id = ?`,
                [id]
            );

            // Parse do alternative_schedule para o response
            if (updatedEmployee.alternative_schedule) {
                updatedEmployee.alternative_schedule = JSON.parse(updatedEmployee.alternative_schedule);
            }

            res.json({
                ...updatedEmployee,
                message: "Funcionário atualizado com sucesso"
            });
        } catch (error) {
            await db.run("ROLLBACK");
            throw error;
        }
    } catch (error) {
        console.error("Erro ao atualizar funcionário:", error);
        res.status(500).json({ 
            message: "Erro ao atualizar funcionário",
            error: error.message 
        });
    }
});

app.get("/api/employees/:id/working-status", authenticateToken, async (req, res) => {
    try {
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
                console.error('Erro ao processar horário alternativo:', error);
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
        console.error(error);
        res.status(500).json({ 
            message: "Erro ao verificar status de trabalho",
            error: error.message 
        });
    }
});

// Rotas para tarefas
app.get('/api/tasks', authenticateToken, async (req, res) => {
    try {
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
});

app.post('/api/tasks', authenticateToken, async (req, res) => {
    try {
        const { name, description, employeeId, priority, isFixed, date, store_id } = req.body;

        if (!name || !store_id) {
            return res.status(400).json({
                message: 'Nome da tarefa e loja são obrigatórios'
            });
        }

        // Verificar permissões e outras validações...

        const result = await db.run(
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

        // Se for uma tarefa fixa, inserir o status inicial como pendente na tabela fixed_task_status
        if (isFixed) {
            await db.run(
                `INSERT INTO fixed_task_status (task_id, date, status) 
                 VALUES (?, ?, 'pendente')`,
                [result.lastID, date]
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
            [result.lastID]
        );

        res.json({
            ...newTask,
            message: 'Tarefa criada com sucesso'
        });
    } catch (error) {
        console.error('Erro ao criar tarefa:', error);
        res.status(500).json({ 
            message: 'Erro ao criar tarefa',
            error: error.message 
        });
    }
});

app.delete("/api/tasks/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Verificar se a tarefa existe
    const task = await db.get("SELECT * FROM tasks WHERE id = ?", [id]);
    if (!task) {
      return res.status(404).json({ message: "Tarefa não encontrada" });
    }

    // Se for admin, pode deletar qualquer tarefa (fixa ou não)
    if (req.user.isAdmin) {
      // Se for uma tarefa fixa, deletar também os status históricos
      if (task.is_fixed) {
        await db.run("BEGIN TRANSACTION");
        try {
          // Deletar registros de status da tarefa fixa
          await db.run("DELETE FROM fixed_task_status WHERE task_id = ?", [id]);
          // Deletar registros do histórico
          await db.run("DELETE FROM task_history WHERE task_id = ?", [id]);
          // Deletar a tarefa
          await db.run("DELETE FROM tasks WHERE id = ?", [id]);
          await db.run("COMMIT");
        } catch (error) {
          await db.run("ROLLBACK");
          throw error;
        }
      } else {
        // Para tarefas não fixas, apenas deletar a tarefa
        await db.run("DELETE FROM tasks WHERE id = ?", [id]);
      }

      return res.json({ message: "Tarefa excluída com sucesso" });
    }

    // Para não-admin, verificar se é uma tarefa fixa
    if (task.is_fixed) {
      return res.status(403).json({
        message: "Apenas administradores podem excluir tarefas fixas",
      });
    }

    // Para não-admin, verificar se é a própria tarefa e se está no horário
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
});

app.patch("/api/tasks/:id/status", authenticateToken, async (req, res) => {
    try {
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
        // Para tarefas fixas, atualizar ou inserir status do dia na tabela fixed_task_status
        await db.run(
          `INSERT INTO fixed_task_status (task_id, date, status)
           VALUES (?, ?, ?)
           ON CONFLICT (task_id, date) 
           DO UPDATE SET status = ?`,
          [id, taskDate, status, status]
        );
  
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
        // Para tarefas regulares, atualizar diretamente na tabela tasks
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
  });

app.get("/api/tasks/fixed/history", authenticateToken, async (req, res) => {
  try {
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
});

// Rota para distribuição automática de tarefas
app.post('/api/tasks/distribute', authenticateToken, async (req, res) => {
    try {
        const { store_id, date } = req.body;
        
        // Configuração de data e hora
        const now = new Date();
        now.setHours(now.getHours() - 3); // Ajuste para horário de Brasília
        const today = date || now.toISOString().split('T')[0];
        const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

        console.log('Iniciando distribuição:', {
            store_id,
            date: today,
            currentTime,
            serverTime: now.toISOString()
        });

        if (!store_id) {
            return res.status(400).json({
                message: 'ID da loja é obrigatório'
            });
        }

        // Verificar permissões do usuário
        if (!req.user.isAdmin) {
            const userEmployee = await db.get(
                'SELECT store_id FROM employees WHERE id = ?',
                [req.user.employeeId]
            );

            if (!userEmployee || userEmployee.store_id !== parseInt(store_id)) {
                return res.status(403).json({
                    message: 'Você só pode distribuir tarefas em sua própria loja'
                });
            }
        }

        // Verificar existência e status da loja
        const store = await db.get(
            'SELECT * FROM stores WHERE id = ? AND active = 1',
            [store_id]
        );

        if (!store) {
            return res.status(404).json({
                message: 'Loja não encontrada ou inativa'
            });
        }

        // Buscar todas as tarefas não atribuídas
        const unassignedTasks = await db.all(`
            SELECT 
                t.*,
                s.name as store_name
            FROM tasks t
            JOIN stores s ON t.store_id = s.id
            WHERE t.date = ? 
            AND t.store_id = ?
            AND t.is_fixed = 0 
            AND (t.employee_id IS NULL OR t.employee_id = 0)
            ORDER BY t.priority DESC, t.id ASC
        `, [today, store_id]);

        console.log('Tarefas não atribuídas:', {
            count: unassignedTasks.length,
            tasks: unassignedTasks
        });

        if (unassignedTasks.length === 0) {
            return res.status(400).json({
                message: 'Não há tarefas para distribuir',
                details: 'Todas as tarefas já estão atribuídas ou não existem tarefas para hoje'
            });
        }

        // Buscar funcionários disponíveis
        const availableEmployees = await db.all(`
            SELECT 
                e.*,
                s.name as store_name,
                (
                    SELECT COUNT(*) 
                    FROM tasks 
                    WHERE employee_id = e.id 
                    AND date = ?
                ) as current_task_count
            FROM employees e
            JOIN stores s ON e.store_id = s.id
            LEFT JOIN leaves l ON e.id = l.employee_id AND l.date = ?
            WHERE e.active = 1 
            AND e.store_id = ?
            AND l.id IS NULL
            AND time(?) BETWEEN time(e.work_start) AND time(e.work_end)
        `, [today, today, store_id, currentTime]);

        console.log('Funcionários disponíveis:', {
            count: availableEmployees.length,
            employees: availableEmployees
        });

        if (availableEmployees.length === 0) {
            return res.status(400).json({
                message: 'Não há funcionários disponíveis no momento',
                details: 'Verifique os horários de trabalho e folgas'
            });
        }

        await db.run('BEGIN TRANSACTION');

        try {
            const distributions = [];
            const taskHistory = new Map();

            // Buscar histórico recente de tarefas para cada funcionário
            for (const emp of availableEmployees) {
                const history = await db.all(`
                    SELECT t.name, th.date 
                    FROM task_history th
                    JOIN tasks t ON th.task_id = t.id
                    WHERE th.employee_id = ?
                    AND th.date >= date(?, '-14 days')
                    ORDER BY th.date DESC
                `, [emp.id, today]);
                taskHistory.set(emp.id, history);
            }

            // Distribuir tarefas
            for (const task of unassignedTasks) {
                let bestEmployee = null;
                let bestScore = -1;

                for (const emp of availableEmployees) {
                    let score = 100;
                    const history = taskHistory.get(emp.id) || [];

                    // Reduzir score baseado em tarefas recentes
                    const recentSimilarTasks = history.filter(h => 
                        h.name === task.name && 
                        new Date(h.date) >= new Date(today + '-14 days')
                    ).length;
                    score -= recentSimilarTasks * 15;

                    // Reduzir score baseado em tarefas atuais
                    score -= (emp.current_task_count || 0) * 10;

                    // Bônus para funcionários com menos tarefas
                    const minTaskCount = Math.min(...availableEmployees.map(e => e.current_task_count || 0));
                    if ((emp.current_task_count || 0) === minTaskCount) {
                        score += 20;
                    }

                    if (score > bestScore) {
                        bestScore = score;
                        bestEmployee = emp;
                    }
                }

                if (bestEmployee) {
                    // Atualizar tarefa
                    await db.run(
                        'UPDATE tasks SET employee_id = ? WHERE id = ?',
                        [bestEmployee.id, task.id]
                    );

                    // Registrar no histórico
                    await db.run(
                        'INSERT INTO task_history (task_id, employee_id, date) VALUES (?, ?, ?)',
                        [task.id, bestEmployee.id, today]
                    );

                    // Atualizar contagem de tarefas do funcionário
                    bestEmployee.current_task_count = (bestEmployee.current_task_count || 0) + 1;

                    distributions.push({
                        taskId: task.id,
                        taskName: task.name,
                        employeeId: bestEmployee.id,
                        employeeName: bestEmployee.name,
                        score: bestScore
                    });
                }
            }

            await db.run('COMMIT');

            // Preparar resposta com estatísticas
            const stats = {
                total: distributions.length,
                byEmployee: Object.fromEntries(
                    availableEmployees.map(emp => [
                        emp.name,
                        distributions.filter(d => d.employeeId === emp.id).length
                    ])
                )
            };

            res.json({
                success: true,
                message: `${distributions.length} tarefas distribuídas com sucesso`,
                distributions,
                statistics: stats,
                details: {
                    date: today,
                    time: currentTime,
                    store: store.name,
                    employeesAvailable: availableEmployees.length,
                    totalTasksDistributed: distributions.length
                }
            });

        } catch (error) {
            await db.run('ROLLBACK');
            throw error;
        }

    } catch (error) {
        console.error('Erro na distribuição de tarefas:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao distribuir tarefas',
            error: error.message,
            details: {
                serverTime: new Date().toISOString(),
                timezone: process.env.TZ
            }
        });
    }
});

// Rotas para tarefas fixas
app.get("/api/tasks/fixed", authenticateToken, async (req, res) => {
  try {
    const tasks = await db.all("SELECT * FROM tasks WHERE is_fixed = 1");
    res.json(tasks);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Erro ao buscar tarefas fixas" });
  }
});

app.post("/api/tasks/fixed", authenticateToken, async (req, res) => {
  try {
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
});

// Rotas para folgas
app.get("/api/leaves", authenticateToken, async (req, res) => {
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
      params.push(`${year}-${month.padStart(2, "0")}`);
    }

    if (employeeId) {
      query += ` AND l.employee_id = ?`;
      params.push(employeeId);
    }

    const leaves = await db.all(query, params);
    res.json(leaves);
  } catch (error) {
    console.error("Erro ao buscar folgas:", error);
    res.status(500).json({ message: "Erro ao buscar folgas" });
  }
});

app.delete("/api/leaves/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Verificar se a folga existe
    const leave = await db.get("SELECT * FROM leaves WHERE id = ?", [id]);
    if (!leave) {
      return res.status(404).json({ message: "Folga não encontrada" });
    }

    // Apenas admin pode remover folgas
    if (!req.user.isAdmin) {
      return res.status(403).json({ message: "Permissão negada" });
    }

    await db.run("DELETE FROM leaves WHERE id = ?", [id]);

    res.json({ message: "Folga removida com sucesso" });
  } catch (error) {
    console.error("Erro ao remover folga:", error);
    res.status(500).json({ message: "Erro ao remover folga" });
  }
});

// Rota para relatórios
app.get('/api/reports', authenticateToken, async (req, res) => {
    try {
        const { type, date, store_id } = req.query;
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

        // Formatar datas para SQL
        const sqlStartDate = startDate.toISOString().split('T')[0];
        const sqlEndDate = endDate.toISOString().split('T')[0];

        // Construir query base de acordo com as permissões
        let baseTaskQuery = req.user.isAdmin ? `
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
        ` : `
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
            AND t.employee_id = ?
        `;

        let queryParams = req.user.isAdmin ? 
            [sqlStartDate, sqlEndDate] :
            [sqlStartDate, sqlEndDate, req.user.employeeId];

        // Adicionar filtro de loja se especificado
        if (store_id) {
            baseTaskQuery += ' AND s.id = ?';
            queryParams.push(store_id);
        }

        baseTaskQuery += ' ORDER BY t.date, t.priority DESC';

        // Buscar tarefas
        const tasks = await db.all(baseTaskQuery, queryParams);

        // Query para folgas
        let leavesQuery = req.user.isAdmin ? `
            SELECT 
                l.*,
                e.name as employee_name,
                s.name as store_name,
                s.id as store_id
            FROM leaves l
            JOIN employees e ON l.employee_id = e.id
            LEFT JOIN stores s ON e.store_id = s.id
            WHERE l.date BETWEEN ? AND ?
        ` : `
            SELECT 
                l.*,
                e.name as employee_name,
                s.name as store_name,
                s.id as store_id
            FROM leaves l
            JOIN employees e ON l.employee_id = e.id
            LEFT JOIN stores s ON e.store_id = s.id
            WHERE l.date BETWEEN ? AND ?
            AND l.employee_id = ?
        `;

        if (store_id) {
            leavesQuery += ' AND s.id = ?';
        }

        const leaves = await db.all(leavesQuery, queryParams);

        // Estatísticas por loja
        const storeStats = {};
        // Estatísticas por funcionário
        const employeeStats = {};
        // Estatísticas por tarefa
        const taskStats = {};
        const totalDays = Math.floor((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;

        // Inicializar estatísticas por loja
        tasks.forEach(task => {
            if (!storeStats[task.store_id]) {
                storeStats[task.store_id] = {
                    storeId: task.store_id,
                    storeName: task.store_name,
                    tasksTotal: 0,
                    tasksCompleted: 0,
                    tasksPending: 0,
                    tasksInProgress: 0,
                    employeesCount: new Set(),
                    leavesCount: 0,
                    completionRate: 0,
                    avgTasksPerDay: 0
                };
            }

            storeStats[task.store_id].tasksTotal++;
            storeStats[task.store_id].employeesCount.add(task.employee_id);

            switch (task.status) {
                case 'concluido':
                    storeStats[task.store_id].tasksCompleted++;
                    break;
                case 'pendente':
                    storeStats[task.store_id].tasksPending++;
                    break;
                case 'em-andamento':
                    storeStats[task.store_id].tasksInProgress++;
                    break;
            }
        });

        // Inicializar estatísticas por funcionário
        tasks.forEach(task => {
            if (!employeeStats[task.employee_id]) {
                employeeStats[task.employee_id] = {
                    employeeId: task.employee_id,
                    employeeName: task.employee_name,
                    username: task.username,
                    storeName: task.store_name,
                    storeId: task.store_id,
                    workStart: task.work_start,
                    workEnd: task.work_end,
                    tasksTotal: 0,
                    tasksCompleted: 0,
                    tasksPending: 0,
                    tasksInProgress: 0,
                    leaves: 0,
                    completionRate: 0,
                    avgTasksPerDay: 0,
                    fixedTasks: 0,
                    regularTasks: 0
                };
            }

            employeeStats[task.employee_id].tasksTotal++;
            
            if (task.is_fixed) {
                employeeStats[task.employee_id].fixedTasks++;
            } else {
                employeeStats[task.employee_id].regularTasks++;
            }

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
        });

        // Processar estatísticas de tarefas
        tasks.forEach(task => {
            if (!taskStats[task.name]) {
                taskStats[task.name] = {
                    taskName: task.name,
                    frequency: 0,
                    completionRate: 0,
                    totalAssigned: 0,
                    completedCount: 0,
                    byStore: {},
                    employees: new Set(),
                    isFixed: task.is_fixed
                };
            }

            // Incrementar estatísticas gerais da tarefa
            taskStats[task.name].frequency++;
            taskStats[task.name].totalAssigned++;
            if (task.status === 'concluido') {
                taskStats[task.name].completedCount++;
            }
            taskStats[task.name].employees.add(task.employee_name);

            // Inicializar e atualizar estatísticas por loja
            if (!taskStats[task.name].byStore[task.store_id]) {
                taskStats[task.name].byStore[task.store_id] = {
                    storeName: task.store_name,
                    count: 0,
                    completed: 0,
                    employees: new Set()
                };
            }
            taskStats[task.name].byStore[task.store_id].count++;
            if (task.status === 'concluido') {
                taskStats[task.name].byStore[task.store_id].completed++;
            }
            taskStats[task.name].byStore[task.store_id].employees.add(task.employee_name);
        });

        // Adicionar folgas às estatísticas
        leaves.forEach(leave => {
            if (employeeStats[leave.employee_id]) {
                employeeStats[leave.employee_id].leaves++;
            }
            if (storeStats[leave.store_id]) {
                storeStats[leave.store_id].leavesCount++;
            }
        });

        // Calcular taxas finais e médias para funcionários
        Object.values(employeeStats).forEach(stat => {
            const workDays = totalDays - stat.leaves;
            stat.completionRate = stat.tasksTotal > 0 ?
                ((stat.tasksCompleted / stat.tasksTotal) * 100).toFixed(1) : '0.0';
            stat.avgTasksPerDay = workDays > 0 ?
                (stat.tasksTotal / workDays).toFixed(1) : '0.0';
        });

        // Calcular taxas finais para lojas
        Object.values(storeStats).forEach(stat => {
            stat.completionRate = stat.tasksTotal > 0 ?
                ((stat.tasksCompleted / stat.tasksTotal) * 100).toFixed(1) : '0.0';
            stat.avgTasksPerDay = totalDays > 0 ?
                (stat.tasksTotal / totalDays).toFixed(1) : '0.0';
            stat.employeesCount = stat.employeesCount.size;
        });

        // Calcular taxas de conclusão por tarefa
        Object.values(taskStats).forEach(stat => {
            stat.completionRate = stat.totalAssigned > 0 ?
                ((stat.completedCount / stat.totalAssigned) * 100).toFixed(1) : '0.0';
            stat.employees = Array.from(stat.employees);
            
            // Converter Sets para Arrays nas estatísticas por loja
            Object.values(stat.byStore).forEach(storeStat => {
                storeStat.employees = Array.from(storeStat.employees);
                storeStat.completionRate = storeStat.count > 0 ?
                    ((storeStat.completed / storeStat.count) * 100).toFixed(1) : '0.0';
            });
        });

        // Preparar estatísticas de produtividade por horário
        const hourlyStats = {};
        tasks.forEach(task => {
            const taskDate = new Date(task.date);
            const hour = taskDate.getHours();
            
            if (!hourlyStats[hour]) {
                hourlyStats[hour] = {
                    hour,
                    totalTasks: 0,
                    completedTasks: 0,
                    byStore: {}
                };
            }

            hourlyStats[hour].totalTasks++;
            if (task.status === 'concluido') {
                hourlyStats[hour].completedTasks++;
            }

            // Estatísticas por hora e por loja
            if (!hourlyStats[hour].byStore[task.store_id]) {
                hourlyStats[hour].byStore[task.store_id] = {
                    storeName: task.store_name,
                    totalTasks: 0,
                    completedTasks: 0
                };
            }
            hourlyStats[hour].byStore[task.store_id].totalTasks++;
            if (task.status === 'concluido') {
                hourlyStats[hour].byStore[task.store_id].completedTasks++;
            }
        });

        // Preparar resposta final
        const response = {
            period: {
                start: sqlStartDate,
                end: sqlEndDate,
                totalDays: totalDays,
                type: type
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
            storeStats: Object.values(storeStats),
            employeeStats: Object.values(employeeStats),
            taskStats: Object.values(taskStats),
            hourlyStats: Object.values(hourlyStats),
            rawData: {
                tasks: req.user.isAdmin ? tasks : undefined,
                leaves: req.user.isAdmin ? leaves : undefined
            }
        };

        res.json(response);
    } catch (error) {
        console.error('Erro ao gerar relatório:', error);
        res.status(500).json({ 
            message: 'Erro ao gerar relatório',
            error: error.message 
        });
    }
});

// Rotas para folgas
app.post("/api/leaves", authenticateToken, async (req, res) => {
  try {
    const { employeeId, date } = req.body;

    const result = await db.run(
      "INSERT INTO leaves (employee_id, date) VALUES (?, ?)",
      [employeeId, date]
    );

    res.json({
      id: result.lastID,
      employeeId,
      date,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Erro ao registrar folga" });
  }
});

app.get("/api/leaves/:employeeId", authenticateToken, async (req, res) => {
  try {
    const leaves = await db.all("SELECT * FROM leaves WHERE employee_id = ?", [
      req.params.employeeId,
    ]);
    res.json(leaves);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Erro ao buscar folgas" });
  }
});

// Rota para lojas

app.post('/api/stores', authenticateToken, async (req, res) => {
    try {
        // Verify admin privileges
        if (!req.user.isAdmin) {
            return res.status(403).json({ message: 'Apenas administradores podem criar lojas' });
        }

        const { name, address, phone } = req.body;

        if (!name) {
            return res.status(400).json({ message: 'Nome da loja é obrigatório' });
        }

        const result = await db.run(
            'INSERT INTO stores (name, address, phone) VALUES (?, ?, ?)',
            [name, address, phone]
        );

        res.json({
            id: result.lastID,
            name,
            address,
            phone,
            message: 'Loja criada com sucesso'
        });
    } catch (error) {
        console.error('Erro ao criar loja:', error);
        res.status(500).json({ message: 'Erro ao criar loja' });
    }
});

app.get('/api/stores', authenticateToken, async (req, res) => {
    try {
        const stores = await db.all(
            'SELECT * FROM stores WHERE active = 1 ORDER BY name'
        );
        res.json(stores);
    } catch (error) {
        console.error('Erro ao buscar lojas:', error);
        res.status(500).json({ message: 'Erro ao buscar lojas' });
    }
});

app.put('/api/stores/:id', authenticateToken, async (req, res) => {
    try {
        if (!req.user.isAdmin) {
            return res.status(403).json({ message: 'Apenas administradores podem editar lojas' });
        }

        const { id } = req.params;
        const { name, address, phone, active } = req.body;

        await db.run(
            'UPDATE stores SET name = ?, address = ?, phone = ?, active = ? WHERE id = ?',
            [name, address, phone, active, id]
        );

        res.json({ message: 'Loja atualizada com sucesso' });
    } catch (error) {
        console.error('Erro ao atualizar loja:', error);
        res.status(500).json({ message: 'Erro ao atualizar loja' });
    }
});

app.delete('/api/stores/:id', authenticateToken, async (req, res) => {
    try {
        const storeId = req.params.id;

        await db.run('BEGIN TRANSACTION');

        try {
            // Verificar se a loja existe
            const store = await db.get('SELECT * FROM stores WHERE id = ?', [storeId]);
            if (!store) {
                await db.run('ROLLBACK');
                return res.status(404).json({ message: 'Loja não encontrada' });
            }

            // Verificar se há funcionários na loja
            const employees = await db.all(
                'SELECT id FROM employees WHERE store_id = ?',
                [storeId]
            );

            // Atualizar funcionários para sem loja (null)
            if (employees.length > 0) {
                await db.run(
                    'UPDATE employees SET store_id = NULL WHERE store_id = ?',
                    [storeId]
                );
            }

            // Remover a loja
            const result = await db.run(
                'DELETE FROM stores WHERE id = ?',
                [storeId]
            );

            await db.run('COMMIT');

            if (result.changes === 0) {
                return res.status(404).json({ message: 'Loja não encontrada' });
            }

            res.json({ 
                message: 'Loja removida com sucesso',
                affectedEmployees: employees.length
            });
        } catch (error) {
            await db.run('ROLLBACK');
            throw error;
        }
    } catch (error) {
        console.error('Erro ao remover loja:', error);
        res.status(500).json({ message: 'Erro ao remover loja' });
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
    console.error("Erro ao iniciar servidor:", error);
    process.exit(1);
  }
}

startServer();