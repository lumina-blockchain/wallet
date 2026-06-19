import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { crx, defineManifest } from '@crxjs/vite-plugin'
import path from 'path'

const manifest = defineManifest({
  manifest_version: 3,
  name: 'Lumina Wallet',
  version: '1.0.0',
  description: 'Futuristic Lumina Blockchain Wallet',
  action: {
    default_popup: 'index.html',
  },
  icons: {
    "16": "icon16.png",
    "48": "icon48.png",
    "128": "icon128.png"
  },
  permissions: ['storage', 'activeTab'],
  background: {
    service_worker: 'src/background.ts',
    type: 'module'
  },
  content_scripts: [
    {
      matches: ['<all_urls>'],
      js: ['src/content.ts'],
      run_at: 'document_start'
    }
  ],
  web_accessible_resources: [
    {
      resources: ['inpage.js'],
      matches: ['<all_urls>']
    }
  ]
})

export default defineConfig({
  plugins: [
    react(),
    crx({ manifest }),
  ],
  resolve: {
    alias: [
      { find: /.*\/grpc\.js$/, replacement: path.resolve(__dirname, 'src/lib/empty.ts') },
      { find: '@grpc/grpc-js', replacement: path.resolve(__dirname, 'src/lib/empty.ts') },
      { find: '@grpc/proto-loader', replacement: path.resolve(__dirname, 'src/lib/empty.ts') }
    ]
  },
  server: {
    port: 5173,
    strictPort: true,
    hmr: {
      port: 5173,
    },
    cors: true,
  },
})
