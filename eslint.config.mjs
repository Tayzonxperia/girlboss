import js from '@eslint/js'
import globals from 'globals'

export default [
    {
        ignores: [
            'node_modules/**',
            'web/node_modules/**',
            'data/**',
            'config/attachments/**',
            'config/avatars/**',
            'config/stickers/**',
            'web/dist/**',
        ],
    },
    {
        files: ['**/*.{js,mjs,cjs}'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: {
                ...globals.node,
                Bun: 'readonly',
            },
        },
        rules: {
            ...js.configs.recommended.rules,
            'no-lonely-if': 'error',
            'no-else-return': ['error', { allowElseIf: false }],
            curly: ['error', 'multi-line', 'consistent'],
            'no-unused-vars': [
                'warn',
                {
                    argsIgnorePattern: '^(?:_|message|user|count|err|error|e|_stderr)$',
                    varsIgnorePattern: '^(?:_|mongoose|botname)$',
                    caughtErrorsIgnorePattern: '^(?:_|err|error|e)$',
                    ignoreRestSiblings: true,
                },
            ],
            'no-empty': ['warn', { allowEmptyCatch: true }],
            'no-prototype-builtins': 'off',
            'no-misleading-character-class': 'off',
            'no-unreachable': 'off',
        },
    },
]
