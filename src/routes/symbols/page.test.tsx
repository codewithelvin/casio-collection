import { describe, expect, it } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderApp } from '../../test/renderApp'
import { ALL_SYMBOLS, SYMBOL_GROUPS, manualUrl } from './symbols.ts'
import { t } from '../../i18n/strings'

describe('the display-symbol page', () => {
  it('resolves at /symbols and renders its heading', async () => {
    renderApp('/symbols')
    expect(
      await screen.findByRole('heading', { name: t('symbols.heading'), level: 2 }),
    ).toBeInTheDocument()
  })

  /**
   * **The one assertion that is about the point of the page.** Everything else
   * here could pass over an empty list; this fails if a group stops rendering
   * its rows, which is the way a glossary quietly becomes a set of headings.
   */
  it('renders every symbol in the glossary', async () => {
    renderApp('/symbols')
    await screen.findByRole('heading', { name: t('symbols.heading'), level: 2 })

    for (const symbol of ALL_SYMBOLS) {
      expect(screen.getByText(symbol.name), symbol.id).toBeInTheDocument()
    }
  })

  it('renders a section heading per group, under the page heading', async () => {
    renderApp('/symbols')
    await screen.findByRole('heading', { name: t('symbols.heading'), level: 2 })

    for (const group of SYMBOL_GROUPS) {
      expect(
        screen.getByRole('heading', { name: t(`symbols.group.${group.id}`), level: 3 }),
        group.id,
      ).toBeInTheDocument()
    }
  })

  /**
   * FR-3.2a's promise, one level down from the watch page: the reader is told
   * which Casio manual the claim was read off, and told it as a link they can
   * open rather than as a number they would have to search for.
   */
  it('links each symbol to the Operation Guide that defines it', async () => {
    renderApp('/symbols')
    await screen.findByRole('heading', { name: t('symbols.heading'), level: 2 })

    // The PM indicator, which every digital Casio in the catalogue has.
    const pm = ALL_SYMBOLS.find((symbol) => symbol.id === 'pm')
    expect(pm).toBeDefined()

    const row = screen.getByText(pm!.name).closest('li')
    expect(row).not.toBeNull()
    for (const module of pm!.modules) {
      expect(within(row!).getByRole('link', { name: module })).toHaveAttribute(
        'href',
        manualUrl(module),
      )
    }
  })

  /** D25's limit, on screen rather than only in a comment. A glossary that let
      itself read as exhaustive would be making a claim nobody can source. */
  it('says what the glossary is read from and what it does not cover', async () => {
    renderApp('/symbols')
    await screen.findByRole('heading', { name: t('symbols.heading'), level: 2 })

    expect(screen.getByText(t('symbols.note.scope'))).toBeInTheDocument()
    expect(screen.getByText(t('symbols.note.variance'))).toBeInTheDocument()
  })

  it('offers a jump link into every section', async () => {
    renderApp('/symbols')
    await screen.findByRole('heading', { name: t('symbols.heading'), level: 2 })

    const jump = screen.getByRole('navigation', { name: t('symbols.jump') })
    for (const group of SYMBOL_GROUPS) {
      expect(
        within(jump).getByRole('link', { name: t(`symbols.group.${group.id}`) }),
        group.id,
      ).toHaveAttribute('href', `#${group.id}`)
    }
  })

  /**
   * The footer disclosure is the page's only way in, so the link working is not
   * a detail — without it the glossary is reachable only by typing the URL.
   */
  it('is reachable from the footer disclosure', async () => {
    const user = userEvent.setup()
    renderApp('/')
    await user.click(await screen.findByRole('button', { name: t('footer.about') }))

    const link = screen.getByRole('link', { name: t('nav.symbols') })
    expect(link).toHaveAttribute('href', '/symbols/')

    await user.click(link)
    expect(
      await screen.findByRole('heading', { name: t('symbols.heading'), level: 2 }),
    ).toBeInTheDocument()
  })
})
