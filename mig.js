// migration.js
async function migrateTaskTable() {
    const sqlite3 = require('sqlite3');
    const { open } = require('sqlite');
    
    try {
        // Abrir conexão com o banco
        const db = await open({
            filename: './database.sqlite',
            driver: sqlite3.Database
        });

        // Iniciar transação
        await db.run('BEGIN TRANSACTION');

        try {
            // Verificar se a coluna description já existe
            const tableInfo = await db.all("PRAGMA table_info(tasks)");
            const hasDescription = tableInfo.some(col => col.name === 'description');

            if (!hasDescription) {
                // Adicionar coluna description
                await db.exec('ALTER TABLE tasks ADD COLUMN description TEXT');
                console.log('Coluna description adicionada com sucesso à tabela tasks');
            } else {
                console.log('Coluna description já existe na tabela tasks');
            }

            await db.run('COMMIT');
            console.log('Migração concluída com sucesso!');

        } catch (error) {
            await db.run('ROLLBACK');
            throw error;
        } finally {
            await db.close();
        }

    } catch (error) {
        console.error('Erro durante a migração:', error);
        process.exit(1);
    }
}

// Executar a migração
migrateTaskTable();