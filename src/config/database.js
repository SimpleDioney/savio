const sqlite3 = require("sqlite3");

// Configuração do banco de dados
const dbConfig = {
    filename: './database.sqlite',
    driver: sqlite3.Database
};

module.exports = dbConfig;