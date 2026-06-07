import { createI18n } from 'vue-i18n';
import en from './en.js';
import de from './de.js';
import es from './es.js';
import fa from './fa.js';
import it from './it.js';
import ru from './ru.js';
import zhCn from './zh-cn.js';
import vi from './vi.js';

export const i18n = createI18n({
  legacy: false, // use Composition API
  locale: 'en',
  fallbackLocale: 'en',
  messages: {
    en: en,
    de: de,
    es: es,
    fa: fa,
    it: it,
    ru: ru,
    'zh-cn': zhCn,
    vi: vi
  }
});
