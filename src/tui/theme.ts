/** ANSI colors follow the user's terminal palette, including light themes. */
export const theme = {
  accent: 'cyan',
  muted: 'gray',
  border: 'gray',
  success: 'green',
  warning: 'yellow',
  error: 'red',
} as const

export const sections = ['Upload', 'Destinations', 'Processing', 'Settings'] as const
export type Section = (typeof sections)[number]
