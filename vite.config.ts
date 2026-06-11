import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [react()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: {
          // Heavy libraries that are only needed on specific pages
          'vendor-exceljs': ['exceljs'],
          'vendor-jspreadsheet': ['jspreadsheet-ce', 'jsuites'],
          'vendor-charts': ['recharts'],
          'vendor-mui': ['@mui/material', '@mui/x-data-grid'],
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
  },
}));
