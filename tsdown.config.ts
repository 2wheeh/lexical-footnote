import {defineConfig} from 'tsdown';

export default defineConfig({
  clean: true,
  dts: true,
  entry: ['src/index.ts', 'src/mdast.ts'],
  format: ['esm', 'cjs'],
  platform: 'browser',
});
