import { Box, Text, useApp, useInput, useWindowSize } from 'ink'
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'

import type { IPicGo } from '../types'
import { createActions } from './actions'
import { Menu, PromptForm, Shortcut } from './components'
import { TextField } from './input'
import { findActions } from './navigation'
import { ActionDetails, ResultPanel, Working } from './screens'
import type { TuiSession } from './session'
import { sections, theme } from './theme'

export function App({ ctx, session }: { ctx: IPicGo; session: TuiSession }) {
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot)
  const actions = useMemo(() => createActions(ctx), [ctx])
  const { exit } = useApp()
  const { columns, rows } = useWindowSize()
  const wide = columns >= 76 && rows >= 23
  const compact = rows < 25
  const uploader = ctx.getConfig<string>('picBed.uploader') || ctx.getConfig<string>('picBed.current') || 'smms'
  const config = ctx.getConfig<Record<string, unknown>>(`picBed.${uploader}`)
  const configured = !!config && Object.keys(config).length > 0
  const configName = String(config?._configName || (configured ? 'Default' : 'Not configured'))
  const secondary = ctx.getConfig<boolean>('settings.enableSecondUploader') ? 'On' : 'Off'
  const [section, setSection] = useState(0)
  const [highlight, setHighlight] = useState(configured ? 0 : 2)
  const [search, setSearch] = useState<string>()
  const [showResults, setShowResults] = useState(false)
  const [showError, setShowError] = useState(false)
  const [quitting, setQuitting] = useState(false)
  const items = findActions(actions, sections[section], search)
  const split = wide && search === undefined
  const selected = items[Math.min(highlight, items.length - 1)]
  const panelHeight = Math.max(9, rows - 8)
  useEffect(() => {
    if (state.resultRevision > 0) setShowResults(true)
  }, [state.resultRevision])
  useEffect(() => {
    if (!state.busy && quitting) exit()
  }, [state.busy, quitting, exit])
  useEffect(() => {
    if (!state.busy && state.error) setShowError(true)
  }, [state.busy, state.error])
  const changeSection = (next: number) => {
    setSection((next + sections.length) % sections.length)
    setHighlight(0)
  }
  const start = (index: number) => {
    const item = items[index]
    if (!item) return
    setSection(sections.indexOf(item.section))
    setHighlight(findActions(actions, item.section).findIndex(action => action.action === item.action))
    setSearch(undefined)
    setShowResults(false)
    setShowError(false)
    void session.run(item.action, item.run)
  }
  useInput((input, key) => {
    if (key.ctrl && input === 'c') {
      if (state.busy) {
        setQuitting(true)
        session.cancel()
      } else exit()
      return
    }
    if (state.busy) return
    if (showError) {
      if (key.escape || key.return) setShowError(false)
      if (input === 'r' && state.results.length) {
        setShowError(false)
        setShowResults(true)
      }
      return
    }
    if (showResults) {
      if (key.escape || key.return) setShowResults(false)
      return
    }
    if (search !== undefined) {
      if (key.escape) {
        setSearch(undefined)
        setHighlight(0)
      }
      return
    }
    if (input === 'q') exit()
    if (input === 'r' && state.results.length) setShowResults(true)
    if (input === '/') {
      setSearch('')
      setHighlight(0)
    }
    if (/^[1-4]$/.test(input)) changeSection(Number(input) - 1)
    if (key.tab) changeSection(section + (key.shift ? -1 : 1))
    if (key.leftArrow) changeSection(section - 1)
    if (key.rightArrow) changeSection(section + 1)
  })
  const statusColor = state.error
    ? theme.error
    : state.status.startsWith('Cancelled')
      ? theme.muted
      : state.status.includes('warning')
        ? theme.warning
        : theme.success
  return (
    <Box flexDirection='column' paddingX={1} width={columns}>
      <Box justifyContent='space-between'>
        <Text bold color={theme.accent}>
          ◆ PICLIST
        </Text>
        {columns >= 76 && <Text color={theme.muted}>Your images, delivered.</Text>}
        <Text color={state.busy ? theme.accent : configured ? theme.success : theme.warning}>
          ● {state.busy ? 'Working' : configured ? 'Ready' : 'Setup needed'}
        </Text>
      </Box>
      <Text wrap='truncate-end'>
        <Text color={theme.muted}>Destination </Text>
        {configured ? `${uploader} / ${configName}` : 'Not configured'}
        <Text color={theme.muted}> · Backup </Text>
        {secondary}
      </Text>
      <Box marginTop={1} marginBottom={1}>
        {state.busy || showResults ? (
          <Text color={theme.muted}>
            {state.busy ? state.title : `${state.resultTitle || 'Latest operation'} / Results`}
          </Text>
        ) : (
          sections.map((name, index) => (
            <Box key={name} marginRight={columns < 60 ? 1 : 2}>
              <Text
                color={section === index && search === undefined ? theme.accent : theme.muted}
                bold={section === index}
                underline={section === index && search === undefined}
              >
                {index + 1} {columns < 55 ? ['Upload', 'Dest.', 'Process', 'Settings'][index] : name}
              </Text>
            </Box>
          ))
        )}
      </Box>
      <Box
        flexDirection='column'
        borderStyle='round'
        borderColor={state.prompt ? theme.accent : theme.border}
        paddingX={1}
        paddingY={rows >= 24 ? 1 : 0}
        minHeight={panelHeight}
      >
        {showError && !state.busy ? (
          <Box flexDirection='column' gap={1}>
            <Text bold color={theme.error}>
              ! {state.title}
            </Text>
            <Text>{state.status}</Text>
            <Text color={theme.muted}>Return to the workspace to check your inputs or destination settings.</Text>
            <Box>
              <Shortcut keys='Enter' label='back to workspace' />
              {state.results.length > 0 && <Shortcut keys='r' label='recent results' />}
            </Box>
          </Box>
        ) : state.prompt ? (
          <PromptForm
            key={state.prompt.id}
            question={state.prompt.question}
            position={state.prompt.position}
            onSubmit={session.answer}
            onCancel={session.cancel}
            compact={compact}
          />
        ) : state.busy ? (
          <Working state={state} quitting={quitting} />
        ) : showResults ? (
          <ResultPanel
            results={state.results}
            title={state.resultTitle || 'Results'}
            wide={wide}
            width={columns - 6}
            height={panelHeight - (rows >= 24 ? 4 : 2)}
            onBack={() => setShowResults(false)}
          />
        ) : (
          <Box flexDirection='column' gap={1}>
            {search !== undefined && (
              <Box>
                <Text color={theme.accent}>/ </Text>
                <TextField
                  value={search}
                  onChange={value => {
                    setSearch(value)
                    setHighlight(0)
                  }}
                  placeholder='Find an action…'
                />
              </Box>
            )}
            <Box flexDirection={split ? 'row' : 'column'} gap={split ? 2 : 1}>
              <Box flexDirection='column' width={split ? 28 : undefined} flexShrink={0} gap={1}>
                <Text color={theme.muted}>
                  {search !== undefined ? `${items.length} MATCHING ACTIONS` : sections[section].toUpperCase()}
                </Text>
                <Menu
                  choices={items.map((item, value) => ({
                    name: search !== undefined ? `${item.label} · ${item.section}` : item.label,
                    value,
                  }))}
                  selectedIndex={highlight}
                  onHighlight={setHighlight}
                  onSubmit={start}
                  limit={Math.max(
                    2,
                    Math.min(8, panelHeight - (rows >= 24 ? 4 : 2) - (search !== undefined ? 2 : 0) - (split ? 3 : 7)),
                  )}
                  vimKeys={search === undefined}
                />
              </Box>
              <Box
                flexDirection='column'
                flexGrow={1}
                flexBasis={split ? 0 : undefined}
                minWidth={0}
                paddingLeft={split ? 2 : 0}
                borderStyle={split ? 'single' : undefined}
                borderColor={theme.border}
                borderTop={false}
                borderRight={false}
                borderBottom={false}
              >
                <ActionDetails item={selected} firstRun={!configured} configPath={ctx.configPath} compact={!split} />
              </Box>
            </Box>
          </Box>
        )}
      </Box>
      <Text color={state.title && !state.busy ? statusColor : theme.muted} wrap='truncate-end'>
        {state.busy
          ? state.prompt
            ? 'Pending form values are saved only when the form is complete.'
            : 'PicList is working on your request.'
          : state.title
            ? `${state.error ? '!' : state.status.startsWith('Cancelled') ? '–' : '✓'} ${state.title}: ${state.status}`
            : configured
              ? 'Ready when you are.'
              : 'Start with “Set up a destination” to connect your first uploader.'}
      </Text>
      <Box flexWrap='wrap'>
        {state.busy ? (
          <Shortcut keys='Ctrl+C' label='exit after active work' />
        ) : showResults || showError ? (
          <>
            <Shortcut keys='↑↓' label='select result' />
            <Shortcut keys='Esc' label='back' />
          </>
        ) : (
          <>
            <Shortcut keys='↑↓' label='move' />
            <Shortcut keys='Enter' label='open' />
            {search === undefined ? (
              <>
                <Shortcut keys='Tab' label='section' />
                <Shortcut keys='/' label='search' />
                {state.results.length > 0 && <Shortcut keys='r' label='results' />}
                <Shortcut keys='q' label='quit' />
              </>
            ) : (
              <Shortcut keys='Esc' label='close search' />
            )}
          </>
        )}
      </Box>
    </Box>
  )
}
