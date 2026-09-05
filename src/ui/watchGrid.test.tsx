import { screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BrowseModel } from '../catalog/schema.ts'
import { renderWithProviders } from '../test/renderWithProviders'
import { WatchGrid } from './WatchGrid'

const aModel = (n: number): BrowseModel =>
  ({
    id: `dw-5600e-${n}`,
    ref: `DW-5600E-${n}`,
    line: 'g-shock',
    series: 'dw-5600',
    source: { url: 'https://www.casio.com/intl/watches/gshock/product.DW-5600E-1/', kind: 'official' },
  }) as BrowseModel

const many = (count: number) => Array.from({ length: count }, (_, i) => aModel(i + 1))

const cards = () => screen.getAllByRole('link').filter((a) => a.getAttribute('href')?.includes('/watch/'))

describe('the grid renders what has been scrolled to (§8.5)', () => {
  let observed: Element[]

  beforeEach(() => {
    observed = []
    // jsdom has no IntersectionObserver. Without one the grid renders
    // everything by design, so a stub is what makes the windowed path testable
    // at all — and the absence of the stub is the other test below.
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        observe(node: Element) {
          observed.push(node)
        }
        disconnect() {}
        unobserve() {}
      },
    )
  })

  afterEach(() => vi.unstubAllGlobals())

  it('renders a first screenful rather than the whole series', () => {
    renderWithProviders(<WatchGrid models={many(120)} />)
    // 670 cards was 11 273 DOM nodes and ~300 ms per keystroke on a throttled
    // phone. 120 is two windows and a bit — enough to prove the window without
    // rendering a thousand real cards under coverage instrumentation, which is
    // slow enough to time the worker out.
    expect(cards()).toHaveLength(48)
  })

  it('renders everything when there is less than a window of it', () => {
    renderWithProviders(<WatchGrid models={many(12)} />)
    expect(cards()).toHaveLength(12)
  })

  it('observes a sentinel while there is more, and not once there is not', () => {
    const { rerender } = renderWithProviders(<WatchGrid models={many(120)} />)
    expect(observed).toHaveLength(1)

    observed = []
    rerender(<WatchGrid models={many(12)} />)
    // A sentinel at the end of a finished list would sit there observing
    // nothing forever.
    expect(observed).toHaveLength(0)
  })

  it('resets the window when the list changes, so a filter cannot inherit it', () => {
    const { rerender } = renderWithProviders(<WatchGrid models={many(120)} />)
    expect(cards()).toHaveLength(48)
    rerender(<WatchGrid models={many(5)} />)
    expect(cards()).toHaveLength(5)
  })
})

describe('without IntersectionObserver', () => {
  it('renders everything, because slow beats absent', () => {
    // Nothing would ever reveal the rest, so a window here would hide watches
    // permanently — worse than rendering them all slowly.
    vi.stubGlobal('IntersectionObserver', undefined)
    renderWithProviders(<WatchGrid models={many(60)} />)
    expect(cards()).toHaveLength(60)
    vi.unstubAllGlobals()
  })
})
