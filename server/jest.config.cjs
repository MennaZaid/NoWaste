/** Jest config for the server (ts-jest). Tests run against the real nowaste_test database. */
/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  setupFiles: ['<rootDir>/tests/setup/loadEnv.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
  },
  // Source files import each other with ".js" (Node ESM style); map them back to the .ts files.
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  // Login tests hash several passwords with bcrypt cost 12 (NFR-09b) on purpose, which can pass Jest's default
  // 5-second limit on a slow or busy laptop. The limit only stops a hung test; it does not change what is checked.
  testTimeout: 20000,
};
