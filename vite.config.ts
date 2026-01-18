import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // The third parameter '' loads all env vars regardless of prefix.
  const env = loadEnv(mode, (process as any).cwd(), '');

  return {
    plugins: [react()],
    define: {
      // Safely replace process.env.API_KEY during build
      'process.env.API_KEY': JSON.stringify(env.VITE_API_KEY),
    },
    // Ensure we handle commonjs dependencies if any
    build: {
      commonjsOptions: {
        transformMixedEsModules: true,
      },
    }
  };
});