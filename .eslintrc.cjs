module.exports = {
  root: true,
  env: { node: true, browser: true, es2022: true },
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true } },
  plugins: ['@typescript-eslint', 'react', 'react-hooks'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react/recommended',
    'plugin:react/jsx-runtime',
    'plugin:react-hooks/recommended',
    // prettier va el ULTIMO: apaga reglas de estilo que chocarian con el formateo
    'prettier'
  ],
  settings: { react: { version: 'detect' } },
  ignorePatterns: ['out', 'dist', 'node_modules', '*.cjs'],
  rules: {
    // el codigo base tiene cero `any`: la regla lo blinda a futuro
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/explicit-function-return-type': 'off',
    // --- reglas aditivas de calidad (no tocan el codigo fuente) ---
    // '== null' / '!= null' siguen permitidos (chequeo de null/undefined)
    eqeqeq: ['error', 'smart'],
    'no-var': 'error',
    'object-shorthand': ['error', 'properties'],
    // uniformar los imports de solo-tipo con la palabra `type` (ya es el patron del repo)
    '@typescript-eslint/consistent-type-imports': [
      'error',
      { prefer: 'type-imports', fixStyle: 'separate-type-imports' }
    ]
  }
}
