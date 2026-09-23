import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

const unused = { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' };

export default tseslint.config(
  { ignores: ['dist', 'cloudrun/dist', 'cloudrun/test/.build', 'public'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    rules: {
      'no-empty': ['error', { allowEmptyCatch: true }],
      '@typescript-eslint/no-unused-vars': ['error', unused],
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    files: ['cloudrun/**/*.{ts,js,cjs}', 'vite.config.ts'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['cloudrun/server.js', 'cloudrun/server/**/*.js', 'cloudrun/test/**/*.cjs'],
    extends: [js.configs.recommended],
    languageOptions: { sourceType: 'commonjs' },
    rules: {
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-unused-vars': ['error', unused],
    },
  },
  // Whole file is SYSTEM_PROMPT text; not worth editing to satisfy a lint rule.
  { files: ['cloudrun/src/constants.ts'], rules: { 'no-useless-escape': 'off' } },
);
