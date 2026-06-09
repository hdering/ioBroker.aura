import config from '@iobroker/eslint-config';

export default [
    ...config,
    {
        ignores: ['www/**', 'node_modules/**', 'dist/**'],
    },
    // Rules for all covered files
    {
        files: ['src-vis/**/*.{ts,tsx}', 'main.js'],
        rules: {
            'react/react-in-jsx-scope': 'off',
            'react/prop-types': 'off',
            '@typescript-eslint/no-explicit-any': 'warn',
            '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
            'no-unused-vars': 'off',
            // not applicable to a React SPA
            '@typescript-eslint/explicit-function-return-type': 'off',
            '@typescript-eslint/explicit-module-boundary-types': 'off',
            'jsdoc/require-jsdoc': 'off',
            'jsdoc/require-param': 'off',
            'jsdoc/multiline-blocks': 'off',
            // codebase uses intentional single-line curly patterns
            'curly': 'off',
            'brace-style': 'off',
        },
    },
    // Type-aware rules — TypeScript files only (main.js has no tsconfig)
    {
        files: ['src-vis/**/*.{ts,tsx}'],
        rules: {
            '@typescript-eslint/no-floating-promises': 'warn',
            '@typescript-eslint/dot-notation': 'warn',
            '@typescript-eslint/no-base-to-string': 'warn',
            '@typescript-eslint/prefer-promise-reject-errors': 'warn',
            '@typescript-eslint/no-unnecessary-type-assertion': 'warn',
        },
    },
    // main.js specifics
    {
        files: ['main.js'],
        rules: {
            '@typescript-eslint/no-require-imports': 'off',
        },
    },
];
