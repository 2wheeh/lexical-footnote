import js from '@eslint/js';
import lexical from '@lexical/eslint-plugin';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/.vocs/**',
      'docs/src/pages.gen.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {'@lexical': lexical},
    rules: {
      // Enforces Lexical's $ conventions: $-prefixed functions may only be
      // called from editor scopes (update/read/transform) or other $fns.
      '@lexical/rules-of-lexical': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
    },
  },
  // Last, so it disables every stylistic rule Prettier owns.
  prettier,
);
