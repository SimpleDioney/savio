const express = require("express");
const path = require("path");
const { initializeDb } = require("./src/models/database");
const authRoutes = require("./src/routes/authRoutes");
const employeeRoutes = require("./src/routes/employeeRoutes");
const leaveRoutes = require("./src/routes/leaveRoutes");
const taskRoutes = require("./src/routes/taskRoutes");
const storeRoutes = require("./src/routes/storeRoutes");
const reportRoutes = require("./src/routes/reportRoutes");

process.env.TZ = 'America/Sao_Paulo';

const app = express();

// Middlewares
app.use(express.json());
app.use(express.static(path.join(__dirname, "./public")));

// Rotas
app.use("/api", authRoutes);
app.use("/api", employeeRoutes);
app.use("/api", leaveRoutes);
app.use("/api", taskRoutes);
app.use("/api", storeRoutes);
app.use("/api", reportRoutes);

// Inicialização do servidor
const PORT = process.env.PORT || 5239;

async function startServer() {
    try {
        // Inicializa o banco de dados antes de iniciar o servidor
        await initializeDb();
        
        app.listen(PORT, () => {
            
        });
    } catch (error) {
        
        process.exit(1);
    }
}

startServer();