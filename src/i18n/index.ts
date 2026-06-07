import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { zhCN } from './locales/zh-CN'

void i18n.use(initReactI18next).init({
  resources: { 'zh-CN': { translation: zhCN } },
  lng: 'zh-CN',
  fallbackLng: 'zh-CN',
  interpolation: { escapeValue: false },
})

export default i18n

/** Non-hook translation for use outside React. */
export function t(key: string): string {
  return i18n.t(key)
}
