import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

const unused = { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' };

const correctness = {
  'no-empty': ['error', { allowEmptyCatch: true }],
  eqeqeq: ['error', 'always', { null: 'ignore' }],
  'prefer-const': 'error',
  'no-var': 'error',
  'no-template-curly-in-string': 'error',
  'no-self-compare': 'error',
  'no-unreachable-loop': 'error',
  'array-callback-return': 'error',
};

const CONTROL_CHAR = [
  { selector: 'Literal[raw=/[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F]/]', message: 'Karakter kontrol di literal — kemungkinan backslash termakan heredoc (CLAUDE.md §10.1). Tulis ulang dengan Edit/Write.' },
  { selector: 'TemplateElement[value.raw=/[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F]/]', message: 'Karakter kontrol di template string — kemungkinan backslash termakan heredoc (CLAUDE.md §10.1).' },
];

const IOS_LAYOUT = [
  { selector: 'Literal[value=/(^|\\s)(fixed inset-0|inset-y-0)(\\s|$)|100dvh/]', message: 'Lapisan layar penuh pakai .vv-fill / .vv-side, bukan fixed inset-0 / inset-y-0 / 100dvh (CLAUDE.md §9).' },
  { selector: 'TemplateElement[value.raw=/(^|\\s)(fixed inset-0|inset-y-0)(\\s|$)|100dvh/]', message: 'Lapisan layar penuh pakai .vv-fill / .vv-side, bukan fixed inset-0 / inset-y-0 / 100dvh (CLAUDE.md §9).' },
];

export default tseslint.config(
  { ignores: ['dist', 'cloudrun/dist', 'cloudrun/test/.build', 'public'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    rules: {
      ...correctness,
      '@typescript-eslint/no-unused-vars': ['error', unused],
      '@typescript-eslint/no-explicit-any': 'off',
      'no-restricted-syntax': ['error', ...CONTROL_CHAR],
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'no-restricted-syntax': ['error', ...CONTROL_CHAR, ...IOS_LAYOUT],
      'no-restricted-imports': ['error', { paths: [
        { name: 'react-dom', importNames: ['createPortal'], message: 'Modal tanpa createPortal — merusak tinggi layar PWA iOS (CLAUDE.md §9).' },
      ] }],
      'no-restricted-properties': ['error',
        { object: 'AbortSignal', property: 'any', message: 'AbortSignal.any belum ada di Safari < 17.4 — iPhone teknisi akan error (CLAUDE.md §9).' },
      ],
      'no-console': ['error', { allow: ['info', 'warn', 'error'] }],
    },
  },
  {
    files: ['cloudrun/**/*.{ts,js,cjs}', 'vite.config.ts'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['cloudrun/src/**/*.ts', 'cloudrun/server.js', 'cloudrun/server/**/*.js'],
    rules: { 'no-console': ['error', { allow: ['info', 'warn', 'error'] }] },
  },
  {
    files: ['cloudrun/server.js', 'cloudrun/server/**/*.js', 'cloudrun/test/**/*.cjs'],
    extends: [js.configs.recommended],
    languageOptions: { sourceType: 'commonjs' },
    rules: {
      ...correctness,
      'no-unused-vars': ['error', unused],
      'no-restricted-syntax': ['error', ...CONTROL_CHAR],
    },
  },
  { files: ['cloudrun/src/constants.ts'], rules: { 'no-useless-escape': 'off', 'no-template-curly-in-string': 'off' } },
);
