import eslint from '@eslint/js';
import stylistic from '@stylistic/eslint-plugin';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    {
        ignores: ['drizzle/**', 'dist/**', 'eslint.config.js']
    },
    eslint.configs.recommended,
    stylistic.configs.customize({
        commaDangle: 'never',
        braceStyle: '1tbs',
        indent: 2,
        jsx: false,
        quoteProps: 'as-needed',
        quotes: 'double',
        semi: true
    }),
    ...tseslint.configs.strictTypeChecked,
    ...tseslint.configs.stylisticTypeChecked,
    {
        languageOptions: {
            parserOptions: {
                project: true,
                tsconfigRootDir: import.meta.dirname
            }
        },
        rules: {
            'no-constant-condition': ['error', {
                checkLoops: 'allExceptWhileTrue'
            }]
        }
    },
    {
        rules: {
            '@typescript-eslint/no-non-null-assertion': 'off',
            '@typescript-eslint/no-unnecessary-condition': ['error', {
                allowConstantLoopConditions: true
            }],
            '@typescript-eslint/prefer-nullish-coalescing': ['error', {
                ignorePrimitives: {
                    boolean: true
                }
            }],
            '@typescript-eslint/restrict-plus-operands': ['error', {
                allowNumberAndString: true
            }],
            '@typescript-eslint/restrict-template-expressions': ['error', {
                allowNumber: true
            }]
        }
    },
    {
        rules: {
            '@stylistic/arrow-parens': 'off',
            '@stylistic/eol-last': 'error',
            '@stylistic/member-delimiter-style': ['error', {
                multiline: {
                    delimiter: 'semi'
                }
            }],
            '@stylistic/no-extra-semi': 'error',
            '@stylistic/no-multi-spaces': ['error', {
                ignoreEOLComments: true
            }],
            '@stylistic/quotes': ['error', 'double', {
                avoidEscape: true
            }]
        }
    }
);
