import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '');
    return {
      server: {
        port: 3001,
        strictPort: false,
        host: '0.0.0.0',
        https: false, // Disabled HTTPS to use HTTP
        headers: {
          'Cross-Origin-Embedder-Policy': 'require-corp',
          'Cross-Origin-Opener-Policy': 'same-origin',
        },
        proxy: {
          '/api-youtube': {
            target: 'https://frameops-production.up.railway.app',
            changeOrigin: true,
            rewrite: (path) => path.replace(/^\/api-youtube/, ''),
            secure: false
          }
        }
      },
      plugins: [
        react(),
        // basicSsl() removed to allow HTTP
      ],
      optimizeDeps: {
        exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util']
      },
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
