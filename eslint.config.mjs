import typescriptEslint from '@typescript-eslint/eslint-plugin';
import jest from 'eslint-plugin-jest';
import tsParser from '@typescript-eslint/parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import js from '@eslint/js';
import { FlatCompat } from '@eslint/eslintrc';
import eslintConfigPrettier from 'eslint-config-prettier';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
});

export default [
  js.configs.recommended,
  ...compat.extends(
    'plugin:@typescript-eslint/eslint-recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:jest/recommended',
  ),
  {
    ignores: ['**/node_modules', '**/lib', '**/.github'],
  },
  {
    plugins: {
      '@typescript-eslint': typescriptEslint,
      jest,
      eslintConfigPrettier,
    },

    languageOptions: {
      parser: tsParser,
    },
  },
];
