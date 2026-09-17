import { Box, Text, useInput } from 'ink'
import { useMemo, useState } from 'react'
import wrapAnsi from 'wrap-ansi'

import type { TuiAction } from './actions'
import { Menu, Shortcut, Spinner } from './components'
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
  if (!item) return <Text color={theme.muted}>Search by task, uploader, plugin or setting.</Text>
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
        [ Enter ] {item.action === 'Set up a destination' ? 'Set up destination' : 'Continue'}
      </Text>
      {item.section === 'Settings' && (
        <Text color={theme.muted} wrap='truncate-middle'>
          Config: {configPath}
        </Text>
      )}
    </Box>
  )
}

export function Working({ state, quitting }: { state: SessionState; quitting: boolean }) {
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
      <Text color={theme.muted}>{quitting ? 'Finishing the current operation before exiting…' : stage}</Text>
      {progress !== undefined && (
        <Text>
          <Text color={theme.accent}>{'━'.repeat(filled)}</Text>
          <Text color={theme.border}>{'─'.repeat(20 - filled)}</Text> {Math.round(progress)}%
        </Text>
      )}
      <Text color={theme.muted}>You can stay here while PicList handles the upload or update.</Text>
    </Box>
  )
}

export function resultName(result: string, index: number): string {
  const original = result.replace(/^Backup: /, '')
  try {
    const url = new URL(original)
    return `${result.startsWith('Backup: ') ? 'Backup · ' : ''}${decodeURIComponent(url.pathname.split('/').pop() || url.hostname)}`
  } catch {
    return original.includes('/') || original.includes('\\')
      ? original.split(/[/\\]/).pop() || `Result ${index + 1}`
      : `Result ${index + 1}`
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
  const [selected, setSelected] = useState(0)
  const [scroll, setScroll] = useState(0)
  const detailWidth = Math.max(10, width - (wide ? 34 : 4))
  const visibleLines = Math.max(1, height - (wide ? 7 : 11))
  const lines = useMemo(
    () => wrapAnsi(results[selected] || '', detailWidth, { hard: true, wordWrap: false, trim: false }).split('\n'),
    [results, selected, detailWidth],
  )
  const offset = Math.min(scroll, Math.max(0, lines.length - visibleLines))
  useInput((_input, key) => {
    if (key.pageDown) setScroll(previous => Math.min(Math.max(0, lines.length - visibleLines), previous + visibleLines))
    if (key.pageUp) setScroll(previous => Math.max(0, previous - visibleLines))
  })
  return (
    <Box flexDirection={wide ? 'row' : 'column'} gap={wide ? 2 : 1}>
      <Box flexDirection='column' width={wide ? 28 : undefined} flexShrink={0} gap={wide ? 1 : 0}>
        <Text color={theme.muted}>
          {results.length} {results.length === 1 ? 'RESULT' : 'RESULTS'}
        </Text>
        <Menu
          choices={results.map((result, index) => ({ name: resultName(result, index), value: index }))}
          selectedIndex={selected}
          pageNavigation={false}
          limit={wide ? Math.max(2, height - 5) : 2}
          onHighlight={index => {
            setSelected(index)
            setScroll(0)
          }}
          onSubmit={onBack}
        />
      </Box>
      <Box flexDirection='column' flexGrow={1} flexBasis={wide ? 0 : undefined} minWidth={0} gap={wide ? 1 : 0}>
        <Text bold wrap='truncate-end'>
          {title}
        </Text>
        <Text color={theme.muted}>
          Selected result · {selected + 1} of {results.length}
        </Text>
        <Text color={theme.accent}>{lines.slice(offset, offset + visibleLines).join('\n')}</Text>
        <Box flexWrap='wrap'>
          <Shortcut keys='Enter' label='back to workspace' />
          {lines.length > visibleLines && <Shortcut keys='PgUp/PgDn' label='scroll link' />}
        </Box>
      </Box>
    </Box>
  )
}
