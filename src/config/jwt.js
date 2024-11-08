const JWT_SECRET = process.env.JWT_SECRET || "seu_secret_key_aqui";

// Configurações do JWT
const jwtConfig = {
    secret: JWT_SECRET,
    options: {
        expiresIn: '24h', // Token expira em 24 horas
    },
    refreshOptions: {
        expiresIn: '7d' // Refresh token expira em 7 dias
    }
};

module.exports = {
    JWT_SECRET,
    jwtConfig
};