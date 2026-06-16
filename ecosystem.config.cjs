module.exports = {
  apps: [
    {
      name: 'opportunity-backend',
      script: './backend/server.js',
      cwd: '/home/ubuntu/opportunityDash',
      interpreter: 'node',
      interpreter_args: '--max-old-space-size=512',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
      },
      max_memory_restart: '450M',
      restart_delay: 3000,
      max_restarts: 10,
      min_uptime: '30s',
      error_file: '/home/ubuntu/logs/pm2-error.log',
      out_file: '/home/ubuntu/logs/pm2-out.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },
  ],
};
