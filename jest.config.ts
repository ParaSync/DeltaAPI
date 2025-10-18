// jest.config.js
module.exports = {
  preset: 'ts-jest', // Use the ts-jest preset for sensible defaults
  testEnvironment: 'node', // Or 'jsdom' for browser environments
  roots: ['<rootDir>/src'], // Adjust to your project structure
  transform: {
    '^.+\\.tsx?$': 'ts-jest', // Transform .ts and .tsx files with ts-jest
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
};
