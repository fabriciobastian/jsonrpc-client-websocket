import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import eslintConfigPrettier from 'eslint-config-prettier/flat';
import jest from 'eslint-plugin-jest';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores(['lib/**', 'coverage/**']),
  js.configs.recommended,
  {
    files: ['src/**/*.ts'],
    extends: [tseslint.configs.recommended],
  },
  {
    files: ['src/**/*.spec.ts'],
    extends: [jest.configs['flat/recommended']],
  },
  eslintConfigPrettier,
]);
