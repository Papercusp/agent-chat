import { defineVitestConfig } from '@papercusp/test-config';
import { mergeConfig } from 'vitest/config';

// jsdom component/hook tests in this submodule need: esbuild jsx:'automatic'
// (components omit `import React`) + server.fs.strict:false (the shared
// fail-on-console setup lives in the superproject's libs/test-config, outside
// this submodule's cwd — vite's fs allow-list otherwise blocks it in the jsdom
// pool). See agent-insights/in-repo-lib-test-jsx-and-vitest-resolution.
export default mergeConfig(defineVitestConfig({ layer: 'unit' }), {
  esbuild: { jsx: 'automatic', jsxImportSource: 'react' },
  server: { fs: { strict: false } },
});
