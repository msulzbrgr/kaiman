import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// Relative base so the built static site works when opened from any path.
export default defineConfig({
    base: './',
    plugins: [react()],
});
