// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const sunspotter = require('./eslint-rules');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', 'android/*', 'ios/*', 'node_modules/*', 'coverage/*', 'scripts/*.py', 'plugins/*', 'eslint-rules/*'],
  },
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { sunspotter },
    rules: {
      'sunspotter/no-words': 'error',
      'sunspotter/no-hardcoded-colors': 'error',
      'sunspotter/no-network': 'error',
      // React Compiler rules. The compiler is not enabled, and these flag Reanimated's
      // documented shared-value pattern (sv.value = …, reading .value in worklets).
      'react-hooks/immutability': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/set-state-in-effect': 'off',
    },
  },
  {
    files: ['__tests__/**'],
    rules: { 'sunspotter/no-hardcoded-colors': 'off', '@typescript-eslint/no-require-imports': 'off' },
  },
]);
