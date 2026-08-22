// D4 — **first in this file, and not optional.** Ant Design 5's static
// message / notification / Modal.confirm APIs still call the React 18 render
// API; without the patch they throw at runtime rather than at build time, which
// means the failure shows up in a toast nobody tested and not in CI.
//
// It lived at the top of `main.tsx` until §12. It has to be evaluated before any
// AntD component renders, and this module is what every one of them is rendered
// inside — so this is the earliest point that is still inside the boundary
// keeping Ant Design out of the first load. Moving it back up one level would
// put `antd` in the entry chunk, which is the whole thing §12 undid.
import '@ant-design/v5-patch-for-react-19'

import type { ReactNode } from 'react'
import { ConfigProvider, App as AntdApp } from 'antd'
import { themeConfig } from '../theme/tokens'
import { useUiStore } from './uiStore'

/**
 * §12 — **Ant Design's providers, and the boundary that keeps them out of the
 * first load.**
 *
 * This used to be the top of `App.tsx`, wrapping the router. Wrapping the router
 * meant `ConfigProvider` and `AntdApp` were in the entry chunk, and those two
 * are not small things to have: `ConfigProvider` reaches `antd/es/form/context`
 * for its `form` prop, which pulled `rc-field-form` and `@rc-component/
 * async-validator` — 114 KB unminified — into the first load of a site where the
 * front door has no form on it. `AntdApp` mounts the holders for message,
 * notification and Modal, another 99 KB, for toasts that only three lazily
 * loaded routes ever raise.
 *
 * So it moved down. **Every AntD-rendering screen wraps itself in this**, and
 * because those screens are already behind `lazy()` boundaries, the providers
 * arrive in their chunk rather than ahead of it. The shell — header, rail,
 * drawer, footer — and the front door render without Ant Design at all, which is
 * why the entry chunk no longer contains it.
 *
 * Nesting is free and expected. Two of these inside each other — a route and the
 * `AccountDropdown` in the header above it — is two `ConfigProvider`s with
 * identical config, and AntD's cssinjs cache is keyed on the token set, so the
 * second one computes nothing. What it must not be is *absent*: an AntD
 * component rendered outside a provider gets the default theme, which on this
 * site means AntD's blue instead of Casio's and a 14 px base instead of 16.
 *
 * `mode` is read here rather than passed, because the toggle lives in the header
 * and the header is outside every one of these boundaries.
 */
export default function AntdRoot({ children }: { children: ReactNode }) {
  const mode = useUiStore((state) => state.mode)

  return (
    <ConfigProvider theme={themeConfig(mode)}>
      {/* AntD's App wires message/notification/Modal to the theme context.
          With the React 19 patch imported in main.tsx, the static APIs work
          too — this is what makes them pick up the current algorithm. */}
      <AntdApp>{children}</AntdApp>
    </ConfigProvider>
  )
}
