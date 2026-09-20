import { Box, Text, useInput, useWindowSize } from 'ink'
import { useEffect, useRef, useState } from 'react'

import type { IInquirerQuestion } from '../utils/inquirerShim'
import { useTranslation } from './i18n'
import { TextField } from './input'
import { isEmptyValue } from './readiness'
import { isSecretQuestion, type PromptPosition } from './session'
import { theme } from './theme'

export interface Choice {
  name: string
  value: any
}

/**
 * Renders a scrolling keyboard menu with optional controlled selection, checkboxes, and page
 * navigation.
 */
export function Menu({
  choices,
  initial = 0,
  selectedIndex,
  multiple,
  checked = [],
  onToggle,
  onSubmit,
  onHighlight,
  limit: visibleLimit,
  active = true,
  vimKeys = true,
  pageNavigation = true,
}: {
  choices: Choice[]
  initial?: number
  selectedIndex?: number
  multiple?: boolean
  checked?: any[]
  onToggle?: (value: any) => void
  onSubmit: (value: any) => void
  onHighlight?: (index: number) => void
  limit?: number
  active?: boolean
  vimKeys?: boolean
  pageNavigation?: boolean
}) {
  const t = useTranslation()
  const [cursor, setCursor] = useState(initial)
  const index = Math.max(0, Math.min(selectedIndex ?? cursor, choices.length - 1))
  const { rows } = useWindowSize()
  const limit = visibleLimit ?? Math.max(2, Math.min(8, rows - 16))
  const start = Math.max(0, Math.min(index - Math.floor(limit / 2), choices.length - limit))
  useInput(
    (input, key) => {
      if (!choices.length || key.ctrl || key.meta) return
      let next = index
      if (key.upArrow || (vimKeys && input === 'k')) next = (index + choices.length - 1) % choices.length
      if (key.downArrow || (vimKeys && input === 'j')) next = (index + 1) % choices.length
      if (pageNavigation && key.pageUp) next = Math.max(0, index - limit)
      if (pageNavigation && key.pageDown) next = Math.min(choices.length - 1, index + limit)
      if (next !== index) {
        setCursor(next)
        onHighlight?.(next)
      }
      if (multiple && input === ' ') onToggle?.(choices[index].value)
      if (key.return) onSubmit(choices[index].value)
    },
    { isActive: active },
  )
  return (
    <Box flexDirection='column'>
      {!choices.length && <Text color={theme.muted}>{t('No matches. Try another search.')}</Text>}
      {choices.slice(start, start + limit).map((choice, offset) => {
        const selected = index === start + offset
        return (
          <Box key={start + offset} backgroundColor={selected ? theme.accent : undefined} paddingX={1}>
            <Text color={selected ? 'black' : undefined} bold={selected} wrap='truncate-end'>
              {selected ? '› ' : '  '}
              {multiple ? `${checked.includes(choice.value) ? '[x]' : '[ ]'} ` : ''}
              {choice.name}
            </Text>
          </Box>
        )
      })}
      {choices.length > limit && (
        <Text color={theme.muted}>
          {' '}
          {index + 1} / {choices.length} · ↑↓ {t('scroll')}
        </Text>
      )}
    </Box>
  )
}

export function Shortcut({ keys, label }: { keys: string; label: string }) {
  return (
    <Text>
      <Text color={theme.accent}>{keys}</Text>
      <Text color={theme.muted}> {label} </Text>
    </Text>
  )
}

/** Animates a busy indicator unless screen-reader mode requests a stable display. */
export function Spinner() {
  const [frame, setFrame] = useState(0)
  useEffect(() => {
    if (process.env.INK_SCREEN_READER === 'true') return
    const timer = setInterval(() => setFrame(frame => (frame + 1) % 4), 150)
    return () => clearInterval(timer)
  }, [])
  return <Text color={theme.accent}>{['◐', '◓', '◑', '◒'][frame]}</Text>
}

/**
 * Renders and validates one legacy question with masked secrets, cancellable input, and filtered
 * choices.
 */
export function PromptForm({
  question,
  position,
  onSubmit,
  onCancel,
  compact = false,
}: {
  question: IInquirerQuestion
  position?: PromptPosition
  onSubmit: (value: any) => void
  onCancel: () => void
  compact?: boolean
}) {
  const t = useTranslation()
  const [value, setValue] = useState(String(question.default ?? ''))
  const [checked, setChecked] = useState<any[]>(Array.isArray(question.default) ? question.default : [])
  const [error, setError] = useState('')
  const [validating, setValidating] = useState(false)
  const [filtering, setFiltering] = useState(false)
  const [query, setQuery] = useState('')
  /** Prevents duplicate submissions while asynchronous validation is running. */
  const lock = useRef(false)
  const mounted = useRef(true)
  /** Suppresses validation results after cancellation, even before React unmounts the form. */
  const cancelled = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const choices: Choice[] =
    question.type === 'confirm'
      ? [
          { name: t('Yes'), value: true },
          { name: t('No'), value: false },
        ]
      : (question.choices || []).map(choice => (typeof choice === 'string' ? { name: choice, value: choice } : choice))
  const filtered = choices.filter(choice => choice.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
  const isSelection = ['list', 'rawlist', 'checkbox', 'confirm'].includes(question.type)
  const secret = isSecretQuestion(question)
  /**
   * Validates an answer once, hides sensitive validation details, and ignores stale or cancelled
   * results.
   */
  const submit = async (answer: any) => {
    if (lock.current || cancelled.current) return
    lock.current = true
    setValidating(true)
    try {
      const missing = question.required && isEmptyValue(answer)
      const result = missing ? t('This field is required.') : await question.validate?.(answer)
      if (!mounted.current || cancelled.current) return
      if (result === false || typeof result === 'string')
        setError(
          missing
            ? t('This field is required.')
            : secret || typeof result !== 'string'
              ? t('Enter a valid value.')
              : t(result),
        )
      else onSubmit(answer)
    } catch {
      if (mounted.current && !cancelled.current) setError(t('Unable to validate this value. Please try again.'))
    } finally {
      lock.current = false
      if (mounted.current) setValidating(false)
    }
  }
  useInput((input, key) => {
    if (key.escape) {
      if (filtering) {
        setFiltering(false)
        setQuery('')
      } else {
        cancelled.current = true
        onCancel()
      }
    }
    if (isSelection && question.type !== 'confirm' && input === '/' && !filtering) setFiltering(true)
    if (question.type === 'confirm' && !key.ctrl && !key.meta && /^(y|n)$/i.test(input))
      void submit(input.toLowerCase() === 'y')
    if (key.return && isSelection && !choices.length && question.type === 'checkbox') void submit([])
  })
  return (
    <Box flexDirection='column' gap={compact ? 0 : 1}>
      <Box justifyContent='space-between'>
        <Text color={secret ? theme.warning : theme.muted}>
          {t(secret ? '◆ PRIVATE INPUT' : isSelection ? 'SELECT AN OPTION' : 'ENTER DETAILS')}
        </Text>
        {position && (
          <Text color={theme.muted}>
            {t('Field ${current} / ${total}', { current: String(position.current), total: String(position.total) })}
          </Text>
        )}
      </Box>
      <Text bold>
        {question.message || question.alias || question.name}
        <Text color={theme.muted}>{!isSelection && ` · ${t(question.required ? 'required' : 'optional')}`}</Text>
      </Text>
      {question.description && <Text color={theme.muted}>{question.description}</Text>}
      {isSelection ? (
        <Box flexDirection='column' gap={compact ? 0 : 1}>
          {filtering && (
            <Box>
              <Text color={theme.accent}>/ </Text>
              <TextField value={query} onChange={setQuery} placeholder={t('Filter options…')} />
            </Box>
          )}
          {!filtering && query && <Text color={theme.muted}>{t('Filter: ${query} · / to edit', { query })}</Text>}
          {!choices.length ? (
            <Text color={theme.muted}>
              {t('No options available.')} {t(question.type === 'checkbox' ? 'Enter to continue.' : 'Esc to return.')}
            </Text>
          ) : (
            <Menu
              key={query}
              choices={filtered}
              initial={Math.max(
                0,
                filtered.findIndex(
                  choice =>
                    choice.value === (question.type === 'confirm' ? Boolean(question.default) : question.default),
                ),
              )}
              multiple={question.type === 'checkbox'}
              checked={checked}
              active={!validating}
              vimKeys={!filtering}
              onToggle={item => {
                if (filtering) return
                setChecked(previous =>
                  previous.includes(item) ? previous.filter(value => value !== item) : [...previous, item],
                )
              }}
              onSubmit={item => {
                if (filtering && question.type === 'checkbox') {
                  setFiltering(false)
                  return
                }
                void submit(question.type === 'checkbox' ? checked : item)
              }}
            />
          )}
          {question.type === 'checkbox' && (
            <Text color={theme.muted}>{t('${count} selected', { count: String(checked.length) })}</Text>
          )}
        </Box>
      ) : (
        <Box borderStyle='round' borderColor={error ? theme.error : theme.accent} paddingX={1}>
          <Text color={theme.accent}>› </Text>
          <TextField
            value={value}
            onChange={next => {
              setValue(next)
              setError('')
            }}
            onSubmit={answer => {
              void submit(answer)
            }}
            focus={!validating}
            mask={secret ? '*' : undefined}
            placeholder={secret ? t('Enter a value…') : question.placeholder || t('Type here…')}
          />
        </Box>
      )}
      {error && <Text color={theme.error}>! {error}</Text>}
      {secret && !compact && (
        <Text color={theme.muted}>{t('Input stays hidden. Use Ctrl+U to replace the current value.')}</Text>
      )}
      <Box flexWrap='wrap'>
        {validating ? (
          <Text color={theme.accent}>{t('Validating…')}</Text>
        ) : (
          <>
            <Shortcut keys='Enter' label={t(filtering && question.type === 'checkbox' ? 'apply filter' : 'confirm')} />
            {isSelection && <Shortcut keys='↑↓' label={t('move')} />}
            {question.type === 'checkbox' && <Shortcut keys='Space' label={t('toggle')} />}
            {isSelection && question.type !== 'confirm' && <Shortcut keys='/' label={t('filter')} />}
            {!isSelection && !compact && <Shortcut keys='Ctrl+U' label={t('clear')} />}
            <Shortcut keys='Esc' label={t(filtering ? 'close filter' : 'cancel')} />
          </>
        )}
      </Box>
    </Box>
  )
}
