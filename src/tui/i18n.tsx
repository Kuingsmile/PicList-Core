import { createContext, useContext } from 'react'

import { tuiKey } from '../i18n/tui'
import type { IPicGo } from '../types'

export type Translate = (message: string, args?: Record<string, string>) => string

export const english: Translate = (message, args) =>
  message.replace(/\$\{([^}]+)\}/g, (match, key: string) => args?.[key] ?? match)

export const translator =
  (ctx: IPicGo): Translate =>
  (message, args) => {
    const key = tuiKey(message)
    const translated = key ? ctx.i18n?.translate(key, args) : undefined
    return translated && translated !== key ? translated : english(message, args)
  }

export const TranslationContext = createContext<Translate>(english)
export const useTranslation = () => useContext(TranslationContext)
