import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  // permite importar ../apps-script/Code.gs (usado no modo demonstração)
  server: { fs: { allow: ['..'] } }
});
