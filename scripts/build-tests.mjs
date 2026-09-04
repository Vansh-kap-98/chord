/**
 * Compiles the engine modules under test into plain ESM so `node --test` can
 * import them. Uses Vite's build API because it already resolves the @shared
 * path alias and TypeScript syntax.
 */
import { build } from 'vite';
import { fileURLToPath, URL } from 'node:url';

const r = (p) => fileURLToPath(new URL(p, import.meta.url));

// One build per entry: a single-entry bundle inlines its imports instead of
// emitting a shared runtime chunk, which keeps the output plain, node-ready ESM.
const ENTRIES = {
  matcher: '../electron/engine/matcher.ts',
  tokens: '../shared/tokens.ts',
  warnings: '../shared/warnings.ts',
};

for (const [name, entry] of Object.entries(ENTRIES)) {
  await build({
    configFile: false,
    logLevel: 'warn',
    resolve: {
      alias: {
        '@shared': r('../shared'),
        '@': r('../src'),
      },
    },
    build: {
      outDir: r('../.test-build'),
      emptyOutDir: false,
      minify: false,
      // ssr targets node, so builtins are left alone rather than browser-shimmed.
      ssr: true,
      lib: {
        entry: r(entry),
        formats: ['es'],
        fileName: () => `${name}.mjs`,
      },
    },
  });
}

console.log('test bundles written to .test-build/');
