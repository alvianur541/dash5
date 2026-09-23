import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

// Empty catches and _-prefixed leftovers are deliberate idioms here, not oversights.
const unused = { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' };
const shared = {
  'no-empty': ['error', { allowEmptyCatch: true }],
  'no-unused-vars': ['error', unused],
};
// Supabase/PostgREST rows arrive untyped; `any` there is a decision, not sloppiness.
const tsRules = {
  'no-empty': ['error', { allowEmptyCatch: true }],
  '@typescript-eslint/no-unused-vars': ['error', unused],
  '@typescript-eslint/no-explicit-any': 'warn',
};

export default tseslint.config(
  {
    ignores: [
      'dist',
      'node_modules',
      'cloudrun/dist',
      'cloudrun/node_modules',
      'cloudrun/test/.build',
      'public',
    ],
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: { ecmaVersion: 2022, globals: globals.browser },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...tsRules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  {
    files: ['cloudrun/src/**/*.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: { ecmaVersion: 2022, globals: globals.node },
    rules: tsRules,
  },
  {
    // The whole file is SYSTEM_PROMPT text; editing it to satisfy a lint rule is not worth the risk.
    files: ['cloudrun/src/constants.ts'],
    rules: { 'no-useless-escape': 'off' },
  },
  {
    files: ['cloudrun/server.js', 'cloudrun/server/**/*.js', 'cloudrun/test/**/*.cjs'],
    extends: [js.configs.recommended],
    languageOptions: { ecmaVersion: 2022, sourceType: 'commonjs', globals: globals.node },
    rules: shared,
  },
  {
    files: ['vite.config.ts', 'eslint.config.js'],
    extends: [js.configs.recommended],
    languageOptions: { ecmaVersion: 2022, globals: globals.node },
    rules: shared,
  },
);
