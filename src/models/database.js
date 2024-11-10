const dbConfig = require("../config/database");
const { open } = require("sqlite");
const bcrypt = require("bcrypt");

let db = null;

async function getDb() {
    if (!db) {
        throw new Error('Database not initialized');
    }
    return db;
}

async function initializeDb() {
    if (!db) {
        db = await open(dbConfig);
    }

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
                ${!hasStoreId ? ", store_id INTEGER REFERENCES stores(id)" : ""}
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

            CREATE TABLE IF NOT EXISTS fcm_tokens(
                employee_id INTEGER PRIMARY KEY NOT NULL
                  REFERENCES employees(id) 
                    ON DELETE CASCADE 
                    ON UPDATE CASCADE,
                token TEXT NOT NULL
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
    
    return db;
}

// Função auxiliar para executar transações
async function withTransaction(callback) {
    const database = await getDb();
    await database.run('BEGIN TRANSACTION');
    try {
        const result = await callback(database);
        await database.run('COMMIT');
        return result;
    } catch (error) {
        await database.run('ROLLBACK');
        throw error;
    }
}

module.exports = {
    getDb,
    initializeDb,
    withTransaction
};