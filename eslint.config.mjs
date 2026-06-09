import config from '@iobroker/eslint-config';

export default [
    ...config,
    {
        ignores: ['www/**', 'node_modules/**', 'dist/**'],
    },
    {
        files: ['src-vis/**/*.{ts,tsx}', 'main.js'],
        rules: {
            'react/react-in-jsx-scope': 'off',
            'react/prop-types': 'off',
            '@typescript-eslint/no-explicit-any': 'warn',
            '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
            'no-unused-vars': 'off',
        },
    },
    {
        files: ['main.js'],
        rules: {
            '@typescript-eslint/no-require-imports': 'off',
        },
    },
];
