import {defineConfig} from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'happy-dom',
    include: ['{src,dev}/**/*.test.{ts,tsx}'],
  },
});
