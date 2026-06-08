import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { LOCAL_PACK } from '../content/localPack'
import { zhCN } from './locales/zh-CN'

// A local content pack (gitignored) may supply its own proper-noun strings (skill / world / equip
// names); merge them over the shipped IP-free base dict.
const translation = { ...zhCN, ...(LOCAL_PACK?.i18n ?? {}) }

void i18n.use(initReactI18next).init({
  resources: { 'zh-CN': { translation } },
  lng: 'zh-CN',
  fallbackLng: 'zh-CN',
  interpolation: { escapeValue: false },
})

export default i18n

/** Non-hook translation for use outside React. */
export function t(key: string): string {
  return i18n.t(key)
}
