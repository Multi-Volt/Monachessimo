import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['dist/', 'coverage/', 'playwright-report/', 'test-results/'] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  prettier,
  {
    rules: {
      // noUncheckedIndexedAccess makes every array read optional. A non-null
      // assertion after a bounds check is clearer than a redundant guard.
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  {
    files: ['tests/**'],
    rules: { '@typescript-eslint/no-dynamic-delete': 'off' },
  },
);
