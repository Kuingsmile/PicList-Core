import { Box, Text, useInput, useWindowSize } from 'ink'
import { useState } from 'react'
import stringWidth from 'string-width'

import { theme } from './theme'

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
const characters = (value: string) => [...segmenter.segment(value)].map(item => item.segment)

/** Keep the cursor in view without wrapping or changing the underlying pasted value. */
export function TextField({
  value,
  onChange,
  onSubmit,
  placeholder = 'Type here…',
  focus = true,
  mask,
  width,
}: {
  value: string
  onChange: (value: string) => void
  onSubmit?: (value: string) => void
  placeholder?: string
  focus?: boolean
  mask?: string
  width?: number
}) {
  const { columns } = useWindowSize()
  const size = Math.max(4, width ?? columns - 12)
  const [position, setPosition] = useState(() => characters(value).length)
  const chars = characters(value)
  const cursor = Math.max(0, Math.min(position, chars.length))
  useInput(
    (input, key) => {
      if (key.return) {
        onSubmit?.(value)
        return
      }
      if (key.escape || key.tab || key.upArrow || key.downArrow || key.pageUp || key.pageDown || key.meta) return
      if (key.ctrl) {
        if (input === 'a') setPosition(0)
        if (input === 'e') setPosition(chars.length)
        if (input === 'u') {
          onChange('')
          setPosition(0)
        }
        if (input === 'k') onChange(chars.slice(0, cursor).join(''))
        return
      }
      if (key.leftArrow) {
        setPosition(Math.max(0, cursor - 1))
        return
      }
      if (key.rightArrow) {
        setPosition(Math.min(chars.length, cursor + 1))
        return
      }
      if (key.home) {
        setPosition(0)
        return
      }
      if (key.end) {
        setPosition(chars.length)
        return
      }
      if (key.backspace) {
        if (cursor > 0) {
          onChange([...chars.slice(0, cursor - 1), ...chars.slice(cursor)].join(''))
          setPosition(cursor - 1)
        }
        return
      }
      if (key.delete) {
        onChange([...chars.slice(0, cursor), ...chars.slice(cursor + 1)].join(''))
        return
      }
      if (!input) return
      onChange([...chars.slice(0, cursor), input, ...chars.slice(cursor)].join(''))
      setPosition(cursor + characters(input).length)
    },
    { isActive: focus },
  )
  const display = chars.map(
    char =>
      mask ||
      char
        .replace(/[\r\n]/g, '↵')
        .replace(/\t/g, '→')
        .replace(/[\x00-\x1f\x7f]/g, '�'),
  )
  const cursorChar = display[cursor] || ' '
  let start = cursor
  let used = stringWidth(cursorChar) + 2
  while (start > 0 && used + stringWidth(display[start - 1]) <= size) {
    used += stringWidth(display[--start])
  }
  let end = Math.min(cursor + 1, display.length)
  while (end < display.length && used + stringWidth(display[end]) <= size) {
    used += stringWidth(display[end++])
  }
  return (
    <Box width={size} minWidth={0}>
      {value ? (
        <Text wrap='truncate-end'>
          <Text color={theme.muted}>{start > 0 ? '‹' : ''}</Text>
          {display.slice(start, cursor).join('')}
          <Text inverse={focus}>{cursorChar}</Text>
          {display.slice(cursor + 1, end).join('')}
          <Text color={theme.muted}>{end < display.length ? '›' : ''}</Text>
        </Text>
      ) : (
        <Text color={theme.muted} wrap='truncate-end'>
          <Text inverse={focus}>{placeholder[0] || ' '}</Text>
          {placeholder.slice(1)}
        </Text>
      )}
    </Box>
  )
}
