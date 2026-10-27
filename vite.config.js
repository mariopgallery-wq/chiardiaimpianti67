import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Relative asset URLs work both at a domain root and under GitHub Pages /repository/.
  base: './',
});
