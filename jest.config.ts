import type { Config } from '@jest/types';

// Sync object
const config: Config.InitialOptions = {
  verbose: true,
  transform: {
    '^.+\\.(t|j)sx?$': 'ts-jest',
  },
  testMatch: ['<rootDir>/src/**/*.spec.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  collectCoverage: true,
  collectCoverageFrom: ['src/**/!(index).{ts,tsx}', '!src/**/*.spec.{ts,tsx}'],
  coverageReporters: ['html', 'json'],
  testEnvironment: "jsdom",
  coverageThreshold: {
    global: {
      branches: 100,
      functions: 100,
      statements: 100,
      lines: 100
    },
  },
};
export default config;
