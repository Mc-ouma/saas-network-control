module.exports = {
  testEnvironment: 'node',
  testTimeout: 30000,
  globalSetup: './tests/globalSetup.js',
  globalTeardown: './tests/teardown.js',
  setupFilesAfterEnv: ['./tests/setup.js'],
  testPathIgnorePatterns: ['/node_modules/', '/__mocks__/'],
  verbose: true,
};