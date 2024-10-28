module.exports = {
    apps: [{
      name: "task-management",
      script: "./server.js",
      instances: "max",
      exec_mode: "cluster",
      watch: true,
      env: {
        NODE_ENV: "production",
        PORT: 3000,
        JWT_SECRET: process.env.JWT_SECRET || "your-secret-key"
      },
      env_production: {
        NODE_ENV: "production"
      },
      error_file: "./logs/error.log",
      out_file: "./logs/output.log",
      time: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      merge_logs: true,
      max_memory_restart: "200M",
    }]
  };