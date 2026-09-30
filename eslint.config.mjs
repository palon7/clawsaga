import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier/flat';
import eslintComments from '@eslint-community/eslint-plugin-eslint-comments';

export default defineConfig([
  globalIgnores(['node_modules/**', 'skills/**/bin/**']),
  js.configs.recommended,
  {
    plugins: { '@eslint-community/eslint-comments': eslintComments },
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    rules: {
      '@eslint-community/eslint-comments/no-unlimited-disable': 'error',
      '@eslint-community/eslint-comments/require-description': [
        'error',
        { ignore: ['eslint-enable'] },
      ],
    },
  },
  {
    files: ['**/*.ts'],
    extends: [tseslint.configs.recommendedTypeChecked],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/consistent-type-assertions': [
        'error',
        { assertionStyle: 'as', objectLiteralTypeAssertions: 'never' },
      ],
    },
    languageOptions: {
      parserOptions: { project: true, tsconfigRootDir: import.meta.dirname },
    },
  },
  {
    files: ['src/**/*.ts'],
    rules: {
      'max-lines': [
        'error',
        { max: 500, skipBlankLines: true, skipComments: true },
      ],
      complexity: ['error', { max: 15 }],
      'max-depth': ['error', 4],
    },
  },
  {
    files: ['**/*.test.ts'],
    rules: {
      'max-lines': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      // Vitest types asymmetric matchers such as expect.any() as any.
      '@typescript-eslint/no-unsafe-assignment': 'off',
    },
  },
  prettier,
]);
