import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'

/**
 * §13.4 — standard TypeScript and hooks rules, plus the three project rules.
 *
 * All three are written with `no-restricted-syntax` rather than by adding a
 * plugin, because §5.3 makes the dependency list exhaustive and none of these
 * needs one. A selector is also easier to read six months from now than a
 * plugin option whose meaning has to be looked up.
 */
export default tseslint.config(
  { ignores: ['dist', 'coverage', 'node_modules', 'playwright-report'] },

  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,

      'no-restricted-syntax': [
        'error',
        {
          // D12 — every user-facing string goes through t(). Whitespace-only
          // JSX text is untouched, so JSX can still be formatted normally.
          selector: 'JSXText[value=/\\S/]',
          message:
            'D12: no string literals in JSX. Add the string to src/i18n/strings.ts and render t(key).',
        },
        {
          // S4 — banned outright, with no exceptions. React escapes by default;
          // this attribute is the only way to undo that, and every note and
          // display name on this site is user-authored text.
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message: 'S4: dangerouslySetInnerHTML is banned. Render user text as text.',
        },
      ],

      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },

  {
    // D31 — a skipped test reads exactly like a passing one in a green run,
    // which makes it worse than a missing one. This is why the rule exists.
    files: ['**/*.test.{ts,tsx}', 'e2e/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'MemberExpression[object.name=/^(describe|it|test)$/][property.name=/^(only|skip)$/]',
          message:
            'D31: .only and .skip are not allowed — a skipped test looks like a passing one.',
        },
      ],
    },
  },

  {
    files: ['scripts/**/*.{mjs,ts}', '*.config.{js,ts}'],
    languageOptions: { globals: globals.node },
  },
)
