import { beforeEach, describe, expect, it } from 'vitest'
import { useUiStore } from './uiStore'

describe('the ui store (§7.2, §8.3)', () => {
  beforeEach(() => {
    localStorage.clear()
    useUiStore.setState({ mode: 'light', drawerOpen: false })
  })

  it('toggles the theme and persists the choice', () => {
    useUiStore.getState().toggleTheme()

    expect(useUiStore.getState().mode).toBe('dark')
    expect(localStorage.getItem('cc.theme')).toBe('dark')
  })

  it('toggles back', () => {
    useUiStore.getState().toggleTheme()
    useUiStore.getState().toggleTheme()

    expect(useUiStore.getState().mode).toBe('light')
    expect(localStorage.getItem('cc.theme')).toBe('light')
  })

  it('opens and closes the drawer', () => {
    useUiStore.getState().setDrawerOpen(true)
    expect(useUiStore.getState().drawerOpen).toBe(true)

    useUiStore.getState().setDrawerOpen(false)
    expect(useUiStore.getState().drawerOpen).toBe(false)
  })
})
