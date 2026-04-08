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
            },
        },
        rules: {
            ...js.configs.recommended.rules,
            'no-lonely-if': 'error',
            'no-else-return': ['error', { allowElseIf: false }],
            'curly': ['error', 'multi-line', 'consistent'],
        },
    },
]

