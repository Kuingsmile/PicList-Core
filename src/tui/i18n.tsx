import { createContext, useContext } from 'react'

import { tuiKey } from '../i18n/tui'
import type { IPicGo } from '../types'

export type Translate = (message: string, args?: Record<string, string>) => string

/** Interpolates named placeholders in the English fallback while retaining unknown placeholders. */
export const english: Translate = (message, args) =>
  message.replace(/\$\{([^}]+)\}/g, (match, key: string) => args?.[key] ?? match)

/**
 * Creates a catalog translator that falls back to interpolated English for unknown or missing
 * messages.
 */
export const translator =
  (ctx: IPicGo): Translate =>
  (message, args) => {
    const key = tuiKey(message)
    const translated = key ? ctx.i18n?.translate(key, args) : undefined
    return translated && translated !== key ? translated : english(message, args)
  }

/** React translation provider with an English fallback for components rendered without a client. */
export const TranslationContext = createContext<Translate>(english)
export const useTranslation = () => useContext(TranslationContext)
