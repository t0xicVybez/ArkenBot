import tseslint from 'typescript-eslint';
import unusedImports from 'eslint-plugin-unused-imports';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/.next/**',
      '**/build/**',
      '**/node_modules/**',
      '**/.docusaurus/**',
      'packages/docs/**',

      'packages/web/**',
      '**/*.config.*',
      '**/*.js',
      '**/*.mjs',
    ],
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin,
      'unused-imports': unusedImports,
    },
    rules: {
      'no-console': 'error',
      '@typescript-eslint/no-explicit-any': 'warn',

      'unused-imports/no-unused-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
  {

    files: ['**/scripts/**', 'prisma/**', 'tests/**'],
    rules: { 'no-console': 'off' },
  },
);
