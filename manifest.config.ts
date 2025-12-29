import { defineManifest } from '@crxjs/vite-plugin'

export default defineManifest({
  manifest_version: 3,
  name: 'Popbar',
  description: 'A macOS-style sidebar for search, AI search, and terminal mode, triggered by Ctrl+Shift+S.',
  version: '0.0.1',
  action: {
    default_title: 'Popbar',
  },
  permissions: ['storage', 'activeTab', 'scripting'],
  host_permissions: ['http://localhost:4000/*'],
  background: {
    service_worker: 'src/background.ts',
    type: 'module',
  },
  content_scripts: [
    {
      matches: ['<all_urls>'],
      js: ['src/content-script.tsx'],
      run_at: 'document_idle',
    },
  ],
  commands: {
    toggle_popbar: {
      suggested_key: {
        default: 'Ctrl+Shift+S',
      },
      description: 'Toggle the Popbar overlay',
    },
  },
})

