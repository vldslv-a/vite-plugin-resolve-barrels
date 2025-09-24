/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pluginJs from '@eslint/js';
import importPlugin from 'eslint-plugin-import';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import sonarjs from 'eslint-plugin-sonarjs';
import eslintPluginSortDestructureKeys from 'eslint-plugin-sort-destructure-keys';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);

const config = [
  {
    files: ['**/*.ts', '**/*.tsx'],
  },
  pluginJs.configs.recommended,
  importPlugin.flatConfigs.recommended,
  sonarjs.configs.recommended,
  {
    plugins: {
      'sort-destructure-keys': eslintPluginSortDestructureKeys,
    },
    rules: {
      'sort-destructure-keys/sort-destructure-keys': 'error',
    },
    settings: {
      'import/resolver': {
        node: {
          paths: ['src'],
        },
        typescript: {
          project: 'src',
        },
      },
    },
  },
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        project: true,
        tsconfigRootDir: dirname,
        extraFileExtensions: ['.mjs'],
      },
    },
  },
  {
    rules: {
      // Eslint rules
      'array-callback-return': 'error',
      'no-alert': 'error',
      'no-await-in-loop': 'error',
      'no-console': 'warn',
      'no-else-return': 'error',
      'no-inner-declarations': 'error',
      'no-empty-function': 'error',
      'no-lone-blocks': 'error',
      'no-lonely-if': 'error',
      'no-multi-assign': 'error',
      'no-multi-str': 'error',
      'no-new-wrappers': 'error',
      'no-param-reassign': ['error', { ignorePropertyModificationsFor: ['state'] }],
      'no-plusplus': 'error',
      'no-promise-executor-return': 'error',
      'no-restricted-syntax': ['error', 'ForInStatement'],
      'no-return-assign': 'error',
      'no-self-compare': 'error',
      'no-shadow': 'off',
      'no-undef-init': 'error',
      'no-unmodified-loop-condition': 'error',
      'no-unneeded-ternary': 'error',
      'no-unreachable-loop': 'error',
      'no-unused-vars': 'off',
      'no-useless-computed-key': 'error',
      'no-useless-concat': 'error',
      'no-useless-rename': 'error',
      'no-useless-return': 'error',
      'no-void': 'error',
      'object-shorthand': 'error',
      'prefer-const': 'error',
      'prefer-object-spread': 'error',
      'prefer-template': 'error',
      yoda: 'error',

      // Typescript-eslint rules
      '@typescript-eslint/consistent-type-definitions': ['error', 'type'],
      '@typescript-eslint/consistent-type-exports': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/method-signature-style': 'error',
      '@typescript-eslint/no-empty-object-type': ['error', { allowObjectTypes: 'always' }],
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/no-invalid-void-type': 'off',
      '@typescript-eslint/no-unsafe-call"': 'off',
      '@typescript-eslint/no-misused-promises': [
        'error',
        {
          checksVoidReturn: {
            attributes: false,
          },
        },
      ],
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-non-null-asserted-optional-chain': 'error',
      '@typescript-eslint/no-require-imports': 'error',
      '@typescript-eslint/no-shadow': 'error',
      '@typescript-eslint/no-unnecessary-type-parameters': 'off',
      '@typescript-eslint/no-dynamic-delete': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
      '@typescript-eslint/no-useless-empty-export': 'error',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      '@typescript-eslint/sort-type-constituents': 'error',
      '@typescript-eslint/strict-boolean-expressions': [
        'error',
        { allowNullableBoolean: true, allowNullableObject: true, allowNullableString: true, allowNumber: false },
      ],
      '@typescript-eslint/switch-exhaustiveness-check': 'error',

      // Sonarjs rules
      'sonarjs/array-constructor': 'error',
      'sonarjs/arrow-function-convention': ['error', { requireParameterParentheses: true }],
      'sonarjs/bool-param-default': 'error',
      'sonarjs/function-return-type': 'off',
      'sonarjs/max-union-size': ['error', { threshold: 5 }],
      'sonarjs/no-array-index-key': 'off',
      'sonarjs/no-duplicate-string': ['error', { ignoreStrings: 'application/json,flat/recommended' }],
      'sonarjs/no-hardcoded-passwords': 'off',
      'sonarjs/no-misused-promises': 'off',
      'sonarjs/no-nested-functions': 'off',
      'sonarjs/no-unknown-property': 'off',
      'sonarjs/no-unused-function-argument': 'error',
      'sonarjs/pseudo-random': 'off',
      'sonarjs/slow-regex': 'off',
      'sonarjs/todo-tag': 'off',

      // Import rules
      'import/consistent-type-specifier-style': ['error', 'prefer-top-level'],
      'import/extensions': ['error', 'never'],
      'import/no-cycle': 'error',
      'import/no-extraneous-dependencies': ['error', { devDependencies: true }],
      'import/newline-after-import': 'error',
      'import/order': [
        'error',
        {
          'newlines-between': 'never',
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index', 'object', 'type'],
          warnOnUnassignedImports: true,
          alphabetize: {
            order: 'asc',
            caseInsensitive: true,
          },
        },
      ],
    },
  },
  eslintPluginPrettierRecommended,
  {
    ignores: ['coverage/', 'dist/'],
  },
];

export default config;
