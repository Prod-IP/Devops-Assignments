import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/apps', '<rootDir>/packages'],
  testMatch: ['**/test/**/*.spec.ts'],
  testPathIgnorePatterns: ['\\.integration\\.spec\\.ts$'],
  moduleNameMapper: {
    '^@ecommerce/common$': '<rootDir>/packages/common/src',
    '^@ecommerce/common/(.*)$': '<rootDir>/packages/common/src/$1',
    '^@ecommerce/db$': '<rootDir>/packages/db/src',
    '^@ecommerce/db/(.*)$': '<rootDir>/packages/db/src/$1',
    '^@ecommerce/powertools$': '<rootDir>/packages/powertools/src',
    '^@ecommerce/powertools/(.*)$': '<rootDir>/packages/powertools/src/$1',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.json',
        isolatedModules: true,
      },
    ],
  },
  collectCoverageFrom: [
    'apps/*/src/**/*.ts',
    'packages/*/src/**/*.ts',
    '!**/*.d.ts',
    '!**/lambda.ts',
    '!**/main.ts',
    '!**/authorizer.ts',
    '!**/app.module.ts',
    '!**/inventory.handler.ts',
    '!**/nest.ts',
    '!**/repository.ts',
  ],
  coveragePathIgnorePatterns: ['/node_modules/', '/dist/'],
  coverageThreshold: {
    global: {
      lines: 80,
    },
  },
  clearMocks: true,
};

export default config;
