import { Box, Text, useInput, useWindowSize } from 'ink'
import { useEffect, useRef, useState } from 'react'

import type { IInquirerQuestion } from '../utils/inquirerShim'
import { TextField } from './input'
import { isSecretQuestion, type PromptPosition } from './session'
import { theme } from './theme'

export interface Choice {
  name: string
  value: any
}

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
      {!choices.length && <Text color={theme.muted}>No matches. Try another search.</Text>}
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
          {index + 1} / {choices.length} · ↑↓ scroll
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

export function Spinner() {
  const [frame, setFrame] = useState(0)
  useEffect(() => {
    if (process.env.INK_SCREEN_READER === 'true') return
    const timer = setInterval(() => setFrame(frame => (frame + 1) % 4), 150)
    return () => clearInterval(timer)
  }, [])
  return <Text color={theme.accent}>{['◐', '◓', '◑', '◒'][frame]}</Text>
}

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
  const [value, setValue] = useState(String(question.default ?? ''))
  const [checked, setChecked] = useState<any[]>(Array.isArray(question.default) ? question.default : [])
  const [error, setError] = useState('')
  const [validating, setValidating] = useState(false)
  const [filtering, setFiltering] = useState(false)
  const [query, setQuery] = useState('')
  const lock = useRef(false)
  const mounted = useRef(true)
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
          { name: 'Yes', value: true },
          { name: 'No', value: false },
        ]
      : (question.choices || []).map(choice => (typeof choice === 'string' ? { name: choice, value: choice } : choice))
  const filtered = choices.filter(choice => choice.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
  const isSelection = ['list', 'rawlist', 'checkbox', 'confirm'].includes(question.type)
  const secret = isSecretQuestion(question)
  const submit = async (answer: any) => {
    if (lock.current || cancelled.current) return
    lock.current = true
    setValidating(true)
    try {
      const empty =
        answer === undefined ||
        answer === '' ||
        (typeof answer === 'string' && !answer.trim()) ||
        (Array.isArray(answer) && !answer.length)
      const result = question.required && empty ? 'This field is required.' : await question.validate?.(answer)
      if (!mounted.current || cancelled.current) return
      if (result === false || typeof result === 'string')
        setError(typeof result === 'string' ? result : 'Enter a valid value.')
      else onSubmit(answer)
    } catch {
      if (mounted.current && !cancelled.current) setError('Unable to validate this value. Please try again.')
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
          {secret ? '◆ PRIVATE INPUT' : isSelection ? 'SELECT AN OPTION' : 'ENTER DETAILS'}
        </Text>
        {position && (
          <Text color={theme.muted}>
            Field {position.current} / {position.total}
          </Text>
        )}
      </Box>
      <Text bold>
        {question.message || question.alias || question.name}
        <Text color={theme.muted}>{!isSelection && (question.required ? ' · required' : ' · optional')}</Text>
      </Text>
      {question.description && <Text color={theme.muted}>{question.description}</Text>}
      {isSelection ? (
        <Box flexDirection='column' gap={compact ? 0 : 1}>
          {filtering && (
            <Box>
              <Text color={theme.accent}>/ </Text>
              <TextField value={query} onChange={setQuery} placeholder='Filter options…' />
            </Box>
          )}
          {!filtering && query && <Text color={theme.muted}>Filter: {query} · / to edit</Text>}
          {!choices.length ? (
            <Text color={theme.muted}>
              No options available.{question.type === 'checkbox' ? ' Enter to continue.' : ' Esc to return.'}
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
          {question.type === 'checkbox' && <Text color={theme.muted}>{checked.length} selected</Text>}
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
            placeholder={secret ? 'Enter a value…' : question.placeholder || 'Type here…'}
          />
        </Box>
      )}
      {error && <Text color={theme.error}>! {error}</Text>}
      {secret && !compact && (
        <Text color={theme.muted}>Input stays hidden. Use Ctrl+U to replace the current value.</Text>
      )}
      <Box flexWrap='wrap'>
        {validating ? (
          <Text color={theme.accent}>Validating…</Text>
        ) : (
          <>
            <Shortcut keys='Enter' label={filtering && question.type === 'checkbox' ? 'apply filter' : 'confirm'} />
            {isSelection && <Shortcut keys='↑↓' label='move' />}
            {question.type === 'checkbox' && <Shortcut keys='Space' label='toggle' />}
            {isSelection && question.type !== 'confirm' && <Shortcut keys='/' label='filter' />}
            {!isSelection && !compact && <Shortcut keys='Ctrl+U' label='clear' />}
            <Shortcut keys='Esc' label={filtering ? 'close filter' : 'cancel'} />
          </>
        )}
      </Box>
    </Box>
  )
}
