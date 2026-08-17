import { Switch, Typography } from 'antd'
import { useUiStore } from './uiStore'
import { t } from '../i18n/strings'

/**
 * §8.3's theme, on the settings page FR-7.1 puts it on.
 *
 * The header already carries a toggle and this is deliberately not a second
 * source of truth — both read and write the same store, so the two controls
 * cannot disagree. What this adds is discoverability: a bulb icon in a header
 * is found by people who already know it is there.
 *
 * A `Switch` rather than a second icon button, because on a settings page the
 * question is "is dark mode on" and a switch answers it by its shape. The
 * header's version answers "make it dark", which is a different sentence.
 */
export function ThemeToggleRow() {
  const mode = useUiStore((state) => state.mode)
  const toggleTheme = useUiStore((state) => state.toggleTheme)
  const dark = mode === 'dark'

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <Switch checked={dark} onChange={toggleTheme} aria-label={t('theme.toDark')} />
      <Typography.Text>{dark ? t('theme.toLight') : t('theme.toDark')}</Typography.Text>
    </div>
  )
}
