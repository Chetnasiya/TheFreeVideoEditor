import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default [
	{ ignores: ['dist/**', '.astro/**'] },
	...tseslint.configs.recommended,
	{
		files: ['src/**/*.tsx'],
		plugins: {
			'react-hooks': reactHooks
		},
		rules: {
			'react-hooks/exhaustive-deps': 'warn',
			'react-hooks/rules-of-hooks': 'error'
		}
	}
];
