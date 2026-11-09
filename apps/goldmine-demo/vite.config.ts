import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  plugins: [
    react(), 
    viteSingleFile(),
    {
      name: 'security-headers',
      transformIndexHtml(html) {
        return html.replace(
          '<head>',
          `<head>
    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self';">
    <meta http-equiv="Strict-Transport-Security" content="max-age=31536000; includeSubDomains">
    <meta http-equiv="X-Frame-Options" content="DENY">`
        );
      }
    }
  ],
  build: { assetsInlineLimit: 100000000, cssCodeSplit: false, modulePreload: false },
});
