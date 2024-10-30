
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

async function addWorkHoursToEmployees() {
    try {
        const db = await open({
            filename: './database.sqlite',
            driver: sqlite3.Database
        });

        console.log('Adicionando campos de horário de expediente...');
        
        await db.exec(`
            ALTER TABLE employees 
            ADD COLUMN work_start_time TEXT DEFAULT '08:00';

            ALTER TABLE employees 
            ADD COLUMN work_end_time TEXT DEFAULT '16:00';
        `);

        console.log('Campos adicionados com sucesso!');
        await db.close();

    } catch (error) {
        console.error('Erro ao adicionar campos:', error);
    }
}

addWorkHoursToEmployees();