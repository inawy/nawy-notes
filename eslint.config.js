import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import prettier from 'eslint-config-prettier';

/**
 * حدود الطبقات (الأدنى لا يستورد من الأعلى) — انظر docs/architecture.md:
 *   types ← data, pwa ← lib ← views        db ← editor, reader ← features ← main
 * كسر الحد يُنتج استيراداً دائرياً أو يُفقد النقاء الذي تعتمد عليه الاختبارات.
 */
function layerRules() {
  const ABOVE = (prefix) => ['db', 'editor', 'editor/**', 'features', 'features/**', 'views', 'views/**', 'main', 'reader'].map((x) => `${prefix}${x}`);
  const rule = (files, group, why) => ({
    files,
    rules: { 'no-restricted-imports': ['error', { patterns: [{ group, message: `حدود الطبقات: ${why}` }] }] },
  });
  return [
    rule(['src/data/**/*.ts', 'src/pwa/**/*.ts'], ['../lib', '../lib/**', '../pwa/**', '../data/**', ...ABOVE('../')], 'data/pwa منطق نقي يستورد types فقط'),
    rule(['src/lib/**/*.ts'], ABOVE('../'), 'lib أدوات عامة لا تعرف الشاشات ولا قاعدة البيانات'),
    rule(['src/views/**/*.ts'], ['../db', '../editor', '../editor/**', '../features', '../features/**', '../main', '../reader', '../pwa/**'], 'views دوال نقية للعرض'),
    rule(['src/db.ts'], ['./editor', './editor/**', './features', './features/**', './views', './views/**', './main', './reader'], 'db لا يعتمد على الواجهة'),
    rule(['src/editor/**/*.ts'], ['../features', '../features/**', '../views', '../views/**', '../main', '../reader'], 'editor لا يستورد من الطبقات الأعلى (استخدم hooks)'),
    rule(['src/reader.ts'], ['./features', './features/**', './main', './editor', './editor/**'], 'reader لا يستورد من الأعلى'),
    rule(['src/features/**/*.ts'], ['../main'], 'features لا تستورد main (يمرّر main الاعتماديات عبر mountX)'),
  ];
}

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'public/**', 'dev-dist/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    languageOptions: { globals: globals.browser },
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
  ...layerRules(),
  {
    files: ['tests/**/*.ts', '*.config.{js,ts}'],
    languageOptions: { globals: globals.node },
  },
  prettier,
);
