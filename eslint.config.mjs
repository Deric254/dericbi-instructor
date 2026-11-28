// Lints the app for real mistakes, not style. Type errors and unused code are already refused by the two tsc checks.
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'

export default tseslint.config(
  { ignores: ['dist/**', 'dist-electron/**', 'release/**', 'node_modules/**', 'tests/**', 'scripts/**', 'content/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    languageOptions: { globals: globals.browser },
    rules: { 'react-hooks/rules-of-hooks': 'error', 'react-hooks/exhaustive-deps': 'warn' },
  },
  {
    files: ['electron/**/*.ts'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['electron/**/*.js'],
    languageOptions: { sourceType: 'commonjs', globals: globals.node },
  },
  {
    // A deliberately small rule set: these catch real bugs. `any` is used on purpose at the IPC and database boundaries.
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-redeclare': ['error', { builtinGlobals: false }],
    },
  },
)
