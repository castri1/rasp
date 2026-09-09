import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import legacy from '@vitejs/plugin-legacy';
import { macBridgePlugin } from './server/macBridge.mjs';
import { alexaBridgePlugin } from './server/alexaBridge.mjs';
import { googleCalendarPlugin } from './server/googleCalendar.mjs';
import { homeBridgePlugin } from './server/homeBridge.mjs';

export default defineConfig({
  plugins: [
    react(),
    legacy({ targets: ['Chrome >= 49'], renderLegacyChunks: true }),
    macBridgePlugin(),
    alexaBridgePlugin(),
    homeBridgePlugin(),
    googleCalendarPlugin(),
  ],
  server: { fs: { deny: ['.env', '.env.*', '*.{crt,pem,key,p12,pfx,cer,der}', '.npmrc', '.yarnrc.yml', '**/.git/**', '**/.rasp/**'] } },
});
