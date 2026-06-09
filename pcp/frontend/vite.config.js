import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Build do PCP. `base` relativo permite servir o app sob qualquer
// subcaminho (ex.: /pcp/) atrás do Apache/Nginx sem reconfiguração.
export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    port: 5173,
    // Em dev, encaminha as chamadas de API para o backend PHP local.
    proxy: {
      '/api': {
        target: 'http://localhost:8090',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
