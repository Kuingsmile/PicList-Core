import { Box, Text, useInput } from 'ink'
import { useEffect, useMemo, useRef, useState } from 'react'
import wrapAnsi from 'wrap-ansi'

import type { TuiAction } from './actions'
import { copyText, resultLink } from './clipboard'
import { Menu, Shortcut, Spinner } from './components'
import { english, type Translate, useTranslation } from './i18n'
import type { NavigationItem } from './navigation'
import type { SessionState } from './session'
import { theme } from './theme'

export function ActionDetails({
  item,
  firstRun,
  configPath,
  compact,
}: {
  item?: NavigationItem & TuiAction
  firstRun: boolean
  configPath: string
  compact: boolean
}) {
  const t = useTranslation()
  if (!item) return <Text color={theme.muted}>{t('Search by task, uploader, plugin or setting.')}</Text>
  if (compact)
    return (
      <Box flexDirection='column' gap={1}>
        <Text color={theme.muted}>{item.description}</Text>
      </Box>
    )
  return (
    <Box flexDirection='column' gap={1}>
      <Text color={firstRun && item.action === 'Set up a destination' ? theme.warning : theme.accent} bold>
        {item.headline}
      </Text>
      <Text>{item.description}</Text>
      <Box flexDirection='column'>
        {item.steps.map((step, index) => (
          <Text key={step} wrap='truncate-end'>
            <Text color={theme.accent}>{String(index + 1).padStart(2, '0')} </Text>
            <Text color={theme.muted}>{step}</Text>
          </Text>
        ))}
      </Box>
      <Text color={theme.accent}>
        [ Enter ] {t(item.action === 'Set up a destination' ? 'Set up destination' : 'Continue')}
      </Text>
      {item.section === 'Settings' && (
        <Text color={theme.muted} wrap='truncate-middle'>
          {t('Config:')} {configPath}
        </Text>
      )}
    </Box>
  )
}

export function Working({ state, quitting }: { state: SessionState; quitting: boolean }) {
  const t = useTranslation()
  const progress = state.progress
  const stage =
    progress === undefined
      ? 'Please wait…'
      : progress >= 100
        ? 'Finishing up…'
        : progress >= 60
          ? 'Uploading images…'
          : progress >= 30
            ? 'Preparing images…'
            : 'Reading your images…'
  const filled = Math.round((progress || 0) / 5)
  return (
    <Box flexDirection='column' gap={1}>
      <Text bold>
        <Spinner /> {state.title}
      </Text>
      <Text color={theme.muted}>{t(quitting ? 'Finishing the current operation before exiting…' : stage)}</Text>
      {progress !== undefined && (
        <Text>
          <Text color={theme.accent}>{'━'.repeat(filled)}</Text>
          <Text color={theme.border}>{'─'.repeat(20 - filled)}</Text> {Math.round(progress)}%
        </Text>
      )}
      <Text color={theme.muted}>{t('You can stay here while PicList handles the upload or update.')}</Text>
    </Box>
  )
}

export function resultName(result: string, index: number, t: Translate = english): string {
  const original = result.replace(/^Backup: /, '')
  try {
    const url = new URL(original)
    return `${result.startsWith('Backup: ') ? `${t('Backup')} · ` : ''}${decodeURIComponent(url.pathname.split('/').pop() || url.hostname)}`
  } catch {
    return original.includes('/') || original.includes('\\')
      ? original.split(/[/\\]/).pop() || t('Result ${count}', { count: String(index + 1) })
      : t('Result ${count}', { count: String(index + 1) })
  }
}

export function ResultPanel({
  results,
  title,
  wide,
  width,
  height,
  onBack,
}: {
  results: string[]
  title: string
  wide: boolean
  width: number
  height: number
  onBack: () => void
}) {
  const t = useTranslation()
  const [selected, setSelected] = useState(0)
  const [scroll, setScroll] = useState(0)
  const [copyStatus, setCopyStatus] = useState('')
  const copying = useRef(false)
  const generation = useRef(0)
  useEffect(
    () => () => {
      generation.current++
    },
    [],
  )
  const value = resultLink(results[selected] || '')
  const isLink = /^(https?:\/\/|file:\/\/)|[/\\]|\.[a-z\d]+$/i.test(value)
  const detailWidth = Math.max(10, width - (wide ? 34 : 4))
  const visibleLines = Math.max(1, height - (wide ? 10 : 14))
  const lines = useMemo(
    () => wrapAnsi(results[selected] || '', detailWidth, { hard: true, wordWrap: false, trim: false }).split('\n'),
    [results, selected, detailWidth],
  )
  const offset = Math.min(scroll, Math.max(0, lines.length - visibleLines))
  const copy = async (markdown: boolean) => {
    if (copying.current || !value || (markdown && !isLink)) return
    copying.current = true
    const current = generation.current
    setCopyStatus(t('Copying…'))
    try {
      await copyText(resultLink(results[selected], markdown))
      if (current === generation.current)
        setCopyStatus(t(markdown ? 'Copied Markdown.' : isLink ? 'Copied URL.' : 'Copied text.'))
    } catch {
      if (current === generation.current) setCopyStatus(t('Clipboard unavailable. Copy the displayed result manually.'))
    } finally {
      copying.current = false
    }
  }
  useInput((input, key) => {
    if (key.ctrl || key.meta) return
    if (input === 'c') void copy(false)
    if (input === 'm') void copy(true)
    if (key.pageDown) setScroll(previous => Math.min(Math.max(0, lines.length - visibleLines), previous + visibleLines))
    if (key.pageUp) setScroll(previous => Math.max(0, previous - visibleLines))
  })
  return (
    <Box flexDirection={wide ? 'row' : 'column'} gap={wide ? 2 : 1}>
      <Box flexDirection='column' width={wide ? 28 : undefined} flexShrink={0} gap={wide ? 1 : 0}>
        <Text color={theme.muted}>
          {results.length} {t(results.length === 1 ? 'RESULT' : 'RESULTS')}
        </Text>
        <Menu
          choices={results.map((result, index) => ({ name: resultName(result, index, t), value: index }))}
          selectedIndex={selected}
          pageNavigation={false}
          limit={wide ? Math.max(2, height - 5) : 2}
          onHighlight={index => {
            setSelected(index)
            setScroll(0)
            generation.current++
            setCopyStatus('')
          }}
          onSubmit={onBack}
        />
      </Box>
      <Box flexDirection='column' flexGrow={1} flexBasis={wide ? 0 : undefined} minWidth={0} gap={wide ? 1 : 0}>
        <Text bold wrap='truncate-end'>
          {title}
        </Text>
        <Text color={theme.muted}>
          {t('Selected result · ${index} of ${count}', { index: String(selected + 1), count: String(results.length) })}
        </Text>
        <Text color={theme.accent}>{lines.slice(offset, offset + visibleLines).join('\n')}</Text>
        {copyStatus && (
          <Text color={theme.muted} wrap='truncate-end'>
            {copyStatus}
          </Text>
        )}
        <Box flexWrap='wrap'>
          <Shortcut keys='c' label={t(isLink ? 'copy URL' : 'copy text')} />
          {isLink && <Shortcut keys='m' label={t('copy Markdown')} />}
          <Shortcut keys='Enter' label={t('back to workspace')} />
          {lines.length > visibleLines && <Shortcut keys='PgUp/PgDn' label={t('scroll link')} />}
        </Box>
      </Box>
    </Box>
  )
}
