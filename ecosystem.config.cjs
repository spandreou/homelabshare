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
        APP_URL: process.env.APP_URL,
        DATABASE_URL: process.env.DATABASE_URL,
        SESSION_SECRET: process.env.SESSION_SECRET,
      },
      max_memory_restart: "500M",
      autorestart: true,
      restart_delay: 2000,
      time: true,
    },
  ],
};
