module.exports = {
  apps: [
    {
      name: "homeLabShare",
      cwd: __dirname,
      script: "npm",
      args: "start",
      env: {
        NODE_ENV: "production",
        PORT: "3000",
      },
      max_memory_restart: "500M",
      autorestart: true,
      restart_delay: 2000,
      time: true,
    },
  ],
};
