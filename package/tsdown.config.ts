import {defineConfig} from 'tsdown';

export default defineConfig({
  clean: true,
  dts: true,
  entry: ['src/index.ts', 'src/mdast.ts', 'src/clipboard.ts'],
  format: ['esm', 'cjs'],
  platform: 'browser',
});
