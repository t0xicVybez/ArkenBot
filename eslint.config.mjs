import tseslint from 'typescript-eslint';

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
    },
    rules: {
      'no-console': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
);
