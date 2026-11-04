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
const path = require('path');

module.exports = {
  apps: [
    {
      name: 'fabrica-server',
      // independente do caminho de instalação (resolve <repo>/server)
      cwd: path.join(__dirname, '..', 'server'),
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
