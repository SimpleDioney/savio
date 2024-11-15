const express = require("express");
const path = require("path");
const { initializeDb, getDb } = require("./src/models/database");
const authRoutes = require("./src/routes/authRoutes");
const employeeRoutes = require("./src/routes/employeeRoutes");
const leaveRoutes = require("./src/routes/leaveRoutes");
const taskRoutes = require("./src/routes/taskRoutes");
const storeRoutes = require("./src/routes/storeRoutes");
const reportRoutes = require("./src/routes/reportRoutes");
const notifyRoutes = require("./src/routes/notifyRoutes");
const firebaseNotifyService = require("./src/services/firebaseNotifyService")

const admin = require("firebase-admin");
const StaticConfigs = require("./src/services/staticConfigs");

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
app.use("/api", notifyRoutes);

// Inicialização do servidor

async function startServer() {
    try {
        // Inicializa o banco de dados antes de iniciar o servidor
        await initializeDb();

        firebaseNotifyService.initialize()
        
        app.listen(StaticConfigs.getPort(), () => {
            console.log(
                `Server has been started on ${StaticConfigs.getPort()}`
            );
        });
    } catch (error) {
        console.error(error)
        process.exit(1);
    }
}

startServer();