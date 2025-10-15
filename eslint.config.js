import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import importPlugin from 'eslint-plugin-import';
import jestPlugin from 'eslint-plugin-jest';
import prettierPlugin from 'eslint-plugin-prettier';
import airbnbBase from 'eslint-config-airbnb-base';
import prettierConfig from 'eslint-config-prettier';

export default [
  js.configs.recommended,
  {
    files: ['src/**/*.ts', 'src/**/*.js'],
    ignores: ['src/tests/**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 12,
        sourceType: 'module',
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      'import': importPlugin,
      'jest': jestPlugin,
      'prettier': prettierPlugin,
    },
    rules: {
      ...airbnbBase.rules,
      ...prettierConfig.rules,
      'no-process-env': 2,
      '@typescript-eslint/explicit-module-boundary-types': 0,
      '@typescript-eslint/no-empty-function': 0,
      '@typescript-eslint/no-shadow': 0,
      '@typescript-eslint/no-empty-interface': 0,
      '@typescript-eslint/no-use-before-define': ['error', 'nofunc'],
      '@typescript-eslint/no-unused-vars': ['warn', { args: 'none' }],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      'arrow-body-style': 0,
      camelcase: 0,
      'class-methods-use-this': 0,
      'import/extensions': [2, 'ignorePackages'],
      'import/no-extraneous-dependencies': [
        'error',
        { devDependencies: ['**/*.test.ts'], peerDependencies: true },
      ],
      'import/no-unresolved': 0,
      'import/prefer-default-export': 0,
      'jest/no-focused-tests': 'error',
      'keyword-spacing': 'error',
      'max-classes-per-file': 0,
      'max-len': 0,
      'no-await-in-loop': 0,
      'no-bitwise': 0,
      'no-console': 0,
      'no-empty-function': 0,
      'no-restricted-syntax': 0,
      'no-shadow': 0,
      'no-continue': 0,
      'no-void': 0,
      'no-underscore-dangle': 0,
      'no-use-before-define': 0,
      'no-useless-constructor': 0,
      'no-return-await': 0,
      'consistent-return': 0,
      'no-else-return': 0,
      'func-names': 0,
      'no-lonely-if': 0,
      'prefer-rest-params': 0,
      'new-cap': ['error', { properties: false, capIsNew: false }],
    },
  },
  {
    files: ['src/tests/**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 12,
        sourceType: 'module',
      },
      globals: {
        TextDecoder: 'readonly',
        TextEncoder: 'readonly',
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        global: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        module: 'readonly',
        require: 'readonly',
        exports: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      'import': importPlugin,
      'jest': jestPlugin,
    },
    rules: {
      'import/no-extraneous-dependencies': 0,
      '@typescript-eslint/no-unused-vars': ['warn', { args: 'none' }],
    },
  },
];
