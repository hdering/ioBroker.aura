import config from '@iobroker/eslint-config';
import tseslint from 'typescript-eslint';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';

// @iobroker/eslint-config sets projectService:true globally, which starts the
// full TS compiler for all ~3000 src-vis files (10+ min on first run).
// Type safety is covered by tsc / CI. Local lint only needs syntax + style.
//
// Two overrides are required:
//  1. tsconfigRootDir — createParseSettings() resolves this BEFORE projectService
//     is checked; without it the parser throws "multiple candidate TSConfigRootDirs"
//     because @iobroker/eslint-config's own package.json is also a candidate.
//  2. projectService:false + project:false — disable type-aware parsing entirely.
const disableTypeChecking = {
    languageOptions: {
        parserOptions: {
            tsconfigRootDir: import.meta.dirname,
            projectService: false,
            project: false,
        },
    },
};

export default [
    ...config,
    disableTypeChecking,
    // Turn off all rules that require type information (they silently misbehave
    // without a project service, and we intentionally disabled it above).
    tseslint.configs.disableTypeChecked,
    {
        ignores: ['www/**', 'node_modules/**', 'dist/**'],
    },
    // Downgrade "Definition for rule X was not found" from error to warning.
    // eslint-plugin-react (v7) is ESLint-10-incompatible so we don't load it;
    // disable comments referencing its rules (react/no-danger etc.) would
    // otherwise be reported as errors.
    {
        linterOptions: { reportUnusedDisableDirectives: 'warn' },
    },
    // Register react + react-hooks plugins so eslint-disable comments referencing
    // their rules are valid. eslint-plugin-react v7 crashes with ESLint 10 when any
    // rule is invoked (getFilename removed), so we register but enable no react rules.
    {
        plugins: { react: reactPlugin, 'react-hooks': reactHooksPlugin },
        rules: {
            'react-hooks/rules-of-hooks': 'error',
            'react-hooks/exhaustive-deps': 'warn',
        },
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
    // main.js specifics
    {
        files: ['main.js'],
        rules: {
            '@typescript-eslint/no-require-imports': 'off',
            // main.js is hand-formatted (aligned require block, compact one-liners).
            // It was previously excluded via .prettierignore; that file is obsolete
            // under @iobroker/eslint-config (W5048), so the exclusion lives here now.
            'prettier/prettier': 'off',
        },
    },
];
