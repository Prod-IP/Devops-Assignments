import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/apps'],
  testMatch: ['**/test/**/*.integration.spec.ts'],
  moduleNameMapper: {
    '^@ecommerce/common$': '<rootDir>/packages/common/src',
    '^@ecommerce/db$': '<rootDir>/packages/db/src',
    '^@ecommerce/powertools$': '<rootDir>/packages/powertools/src',
  },
  testTimeout: 60000,
  clearMocks: true,
};

export default config;
