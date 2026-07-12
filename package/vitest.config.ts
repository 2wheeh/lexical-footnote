import {defineConfig} from 'vitest/config';

/**
 * Two projects, because some of what this extension does can only be judged by
 * a real browser. Each note is its own editable island (that is what a slot
 * container is), and caret movement across an island boundary is exactly where
 * the engines disagree: Firefox will not carry the caret out of one, Chrome and
 * Safari will. happy-dom has no caret at all and cannot see any of it, so
 * `*.browser.test.ts` runs in Chromium and Firefox for real.
 *
 * Everything else — model, numbering, import/export — is engine-agnostic and
 * stays in the fast headless project.
 */
export default defineConfig({
  test: {
    projects: [
      {
        extends: true,
        test: {
          environment: 'happy-dom',
          exclude: ['**/node_modules/**', '**/*.browser.test.{ts,tsx}'],
          include: ['{src,dev,spike}/**/*.test.{ts,tsx}'],
          name: 'unit',
        },
      },
      {
        extends: true,
        test: {
          browser: {
            enabled: true,
            headless: true,
            instances: [
              {browser: 'chromium'},
              {browser: 'firefox'},
              {browser: 'webkit'},
            ],
            provider: 'playwright',
          },
          include: ['src/**/*.browser.test.{ts,tsx}'],
          name: 'browser',
        },
      },
    ],
  },
});
