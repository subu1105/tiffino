import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/server.ts'],
  format: ['esm'],
  outDir: 'dist',
  clean: true,
  // @tiffino/shared is consumed as TS source — it must be bundled in, or the
  // production `node dist/server.js` can't resolve it.
  noExternal: ['@tiffino/shared'],
  // Bundled CJS deps (mongodb via mongoose) call require() at runtime; an ESM
  // bundle has no require unless we provide one.
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
});
