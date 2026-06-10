import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Build do PCP. `base` relativo permite servir o app sob qualquer
// subcaminho (ex.: /pcp/) atrás do Apache/Nginx sem reconfiguração.
export default defineConfig({
  plugins: [react()],
  // Em produção sob subpath (ex.: /fabrica/pcp/), defina VITE_BASE no build.
  base: process.env.VITE_BASE || './',
  server: {
    port: 5173,
    // Em dev, encaminha as chamadas de API para o backend Node local (server/).
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3020',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
