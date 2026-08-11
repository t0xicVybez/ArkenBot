import tseslint from 'typescript-eslint';
import unusedImports from 'eslint-plugin-unused-imports';

// Warn-first lint config. Everything is a warning for now so `eslint` exits 0
// and doesn't block CI — the goal is visibility, not a hard gate yet. Promote
// individual rules to "error" (and fix them) over time to make lint a real gate.
export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/.next/**',
      '**/build/**',
      '**/node_modules/**',
      '**/.docusaurus/**',
      'GameQuery/**',
      'packages/docs/**',
      // web needs react/next-specific lint rules (its inline disables reference
      // react-hooks) — set up separately; base config covers the previously
      // unlinted server packages + addons.
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
      // unused-imports/no-unused-imports is auto-fixable (removes the import);
      // the base no-unused-vars rule is not. Keep the tseslint rule for the
      // remaining (non-import) unused vars.
      'unused-imports/no-unused-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // CLI scripts and DB seeds are command-line tools, not long-running services
    // — plain console output is the right thing there, not the structured logger.
    files: ['**/scripts/**', 'prisma/**'],
    rules: { 'no-console': 'off' },
  },
);
