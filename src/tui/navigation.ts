import type { TuiAction } from './actions'
import { english, type Translate } from './i18n'
import type { Section } from './theme'

export interface NavigationItem {
  label: string
  action: string
  section: Section
  headline: string
  steps: string[]
}

export const navigation: NavigationItem[] = [
  {
    label: 'Files & URLs',
    action: 'Upload files or URLs',
    section: 'Upload',
    headline: 'From your files to a link.',
    steps: ['Paste paths or image URLs', 'Follow upload progress', 'Get ready-to-use links'],
  },
  {
    label: 'Clipboard image',
    action: 'Upload clipboard image',
    section: 'Upload',
    headline: 'Copy. Upload. Share.',
    steps: ['Copy an image to the clipboard', 'Upload to your destination', 'Get the image link'],
  },
  {
    label: 'Set up a destination',
    action: 'Set up a destination',
    section: 'Upload',
    headline: 'Give your images a home.',
    steps: ['Choose an uploader', 'Name your configuration', 'Add connection details'],
  },
  {
    label: 'Switch destination',
    action: 'Switch uploader',
    section: 'Destinations',
    headline: 'Send images somewhere new.',
    steps: ['Choose an uploader', 'Select a saved configuration', 'Use it for your next upload'],
  },
  {
    label: 'Saved configurations',
    action: 'Uploader configurations',
    section: 'Destinations',
    headline: 'Every account, in one place.',
    steps: ['Choose an uploader', 'Create, edit or rename a configuration', 'Set a default or remove an old one'],
  },
  {
    label: 'Secondary uploader',
    action: 'Secondary uploader',
    section: 'Destinations',
    headline: 'Keep a second copy.',
    steps: ['Enable backup uploads', 'Select a saved destination', 'Choose how images are processed'],
  },
  {
    label: 'Check connection',
    action: 'Check connection',
    section: 'Destinations',
    headline: 'Try your destination.',
    steps: ['Validate required settings', 'Confirm a small test upload', 'Review the returned link'],
  },
  {
    label: 'Image processing',
    action: 'Image processing',
    section: 'Processing',
    headline: 'Make each image your own.',
    steps: [
      'Choose global or per-destination settings',
      'Compress, watermark or rename',
      'Save your processing preferences',
    ],
  },
  {
    label: 'Input transformer',
    action: 'Transformer',
    section: 'Processing',
    headline: 'Prepare your input.',
    steps: ['Choose a transformer', 'Review its configuration', 'Use it for future uploads'],
  },
  {
    label: 'Plugins',
    action: 'Plugins',
    section: 'Settings',
    headline: 'Add your favorite tools.',
    steps: ['Manage installed plugins', 'Enable, configure, install or update', 'Restart to reload plugin code'],
  },
  {
    label: 'Upload proxy',
    action: 'Proxy',
    section: 'Settings',
    headline: 'Choose your connection.',
    steps: ['Enter an HTTP(S) proxy URL', 'Leave it empty to clear the proxy', 'Save your connection preference'],
  },
  {
    label: 'Language',
    action: 'Language',
    section: 'Settings',
    headline: 'Use PicList in your language.',
    steps: ['Choose a language', 'Apply it to navigation and forms', 'Continue in the current workspace'],
  },
]

export function findActions(
  actions: TuiAction[],
  section: Section,
  query?: string,
  t: Translate = english,
): (NavigationItem & TuiAction)[] {
  const words = query?.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean) || []
  return navigation.flatMap(item => {
    const action = actions.find(action => action.id === item.action)
    if (!action || (query === undefined && item.section !== section)) return []
    const searchable =
      `${item.label} ${item.action} ${item.section} ${t(item.label)} ${t(item.section)} ${action.description}`.toLocaleLowerCase()
    return words.every(word => searchable.includes(word))
      ? [
          {
            ...action,
            ...item,
            label: t(item.label),
            headline: t(item.headline),
            steps: item.steps.map(step => t(step)),
          },
        ]
      : []
  })
}
