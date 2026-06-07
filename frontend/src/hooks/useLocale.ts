import { store } from '../stores';
import { ElMessage } from 'element-plus';

export const AVAILABLE_LOCALES: Record<string, string> = {
  en: 'English',
  vi: 'Tiếng Việt',
  de: 'Deutsch',
  es: 'Español',
  ru: 'Русский',
  'zh-cn': '简体中文',
  it: 'Italiano',
  fa: 'Farsi'
};

export function useLocale() {
  const handleLocaleChange = (locale: string) => {
    store.setLocale(locale);
    ElMessage.success(store.t('Language changed successfully'));
  };

  return {
    availableLocales: AVAILABLE_LOCALES,
    handleLocaleChange
  };
}
