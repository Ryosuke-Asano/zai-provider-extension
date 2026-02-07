/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src", "<rootDir>/tests"],
  testMatch: ["**/__tests__/**/*.ts", "**/*.test.ts"],
  globals: {
    'ts-jest': {
      tsconfig: "<rootDir>/tsconfig.test.json"
    }
  },
  collectCoverageFrom: [
    "src/**/*.ts",
    "!src/**/*.d.ts",
    "!src/extension.ts", // Extension activation is hard to test
  ],
  moduleFileExtensions: ["ts", "js", "json"],
  verbose: true,
  moduleNameMapper: {
    "^vscode$": "<rootDir>/__mocks__/vscode.ts",
  },
};
