import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

// Restrictions mirror the OpenGrep rules that cost points in past Topcoder reviews
const sastMirrors = [
  { selector: "MemberExpression[object.name='Math'][property.name='random']", message: 'Use crypto.randomInt / crypto.randomUUID, or the seeded PRNG in the generator.' },
  { selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']", message: 'Render creatives as React components, never raw HTML.' },
  { selector: "CallExpression[callee.name='eval']", message: 'eval is not allowed.' },
  { selector: "NewExpression[callee.name='Function']", message: 'new Function is not allowed.' },
];

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/dist/**', '**/coverage/**', 'release/**', 'playwright-report/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node }, ecmaVersion: 2023, sourceType: 'module' },
    rules: {
      'no-restricted-syntax': ['error', ...sastMirrors],
      'no-console': 'error',
      'no-implied-eval': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { ignoreRestSiblings: true, argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    files: ['scripts/**/*.mjs'],
    rules: { 'no-console': 'off' },
  },
);
