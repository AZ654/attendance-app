import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // node: 内置模块（如 node:sqlite）交给 Node 原生加载，避免 vite 误解析
    server: {
      deps: {
        external: [/^node:/],
      },
    },
  },
});
