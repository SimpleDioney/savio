module.exports = {
  apps: [{
    name: "task-management",
    script: "./server.js",
    instances: 1,
    autorestart: true,
    watch: false, // Desativamos o watch mode para evitar reinícios constantes
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    }
  }]
};
