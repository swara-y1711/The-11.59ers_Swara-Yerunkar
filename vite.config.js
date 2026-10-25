import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // Split vendor code into separate chunk to keep main bundle smaller
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('lucide-react')) return 'lucide';
            if (id.includes('jspdf')) return 'jspdf';
            // default vendor chunk
            return 'vendor';
          }
        },
      },
    },
    // Increase warning limit to avoid premature failures, but keep an eye on chunk size
    chunkSizeWarningLimit: 800,
  },
});
