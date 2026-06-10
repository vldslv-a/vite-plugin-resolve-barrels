import type { Config } from 'jest';

const config: Config = {
  collectCoverageFrom: ['**/src/**/*.{ts}'],
  moduleDirectories: ['node_modules', 'src'],
  testEnvironment: 'node',
  testMatch: ['**/*.test.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  reporters: [
    'default',
    [
      'jest-junit',
      {
        outputDirectory: 'reports',
        outputName: 'jest-junit.xml',
        suiteNameTemplate: '{filename}',
        ancestorSeparator: ' › ',
        uniqueOutputName: 'false',
      },
    ],
  ],
};

export default config;
