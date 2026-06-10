/**
 * PM2 — serviço do backend unificado fabrica.
 *
 * Padrão do servidor compartilhado (ver docs/SERVIDOR-COMPARTILHADO.md):
 * processo com nome próprio, porta própria (>= 3020), banco próprio.
 *
 * Uso:
 *   pm2 start deploy/ecosystem.config.js --only fabrica-server
 *   pm2 save
 *
 * Após mudança de código, prefira (evita cache de módulos do PM2):
 *   pm2 delete fabrica-server && pm2 start deploy/ecosystem.config.js --only fabrica-server && pm2 save
 *
 * As variáveis de ambiente vêm de server/.env (via dotenv).
 */
module.exports = {
  apps: [
    {
      name: 'fabrica-server',
      cwd: '/var/www/fabrica/server', // ajuste se instalar em outro caminho
      script: 'src/server.js',
      exec_mode: 'fork',
      instances: 1,
      max_memory_restart: '400M',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
