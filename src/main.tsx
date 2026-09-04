/**
 * §12 — **D4's patch moved to `ui/AntdRoot`, and this comment is here so nobody
 * puts it back.**
 *
 * It was the first import in this file and the comment said it was not optional,
 * which is still true: Ant Design 5's static `message` / `notification` /
 * `Modal.confirm` APIs call the React 18 render API, and without the patch they
 * throw at runtime rather than at build time — a failure that shows up in a toast
 * nobody tested and not in CI.
 *
 * What changed is that `@ant-design/v5-patch-for-react-19` imports from `antd`,
 * so an import *here* is an import of Ant Design in the entry chunk — the one
 * thing §12 exists to prevent. It now sits at the top of `AntdRoot`, which is the
 * module every AntD-rendering screen goes through and which is loaded in that
 * screen's chunk. The patch still runs before any AntD component renders; it just
 * no longer runs before the front door paints.
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'
import { registerServiceWorker } from './pwa/offline'
import { startAnalytics } from './analytics/gtag'

const container = document.getElementById('root')
if (!container) throw new Error('Root element #root is missing from index.html')

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
// FR-11.1 / D33 — after render, and only in a production build. See offline.ts.
registerServiceWorker()

/**
 * D68 — after render, like the worker above, and for the same reason: nothing
 * here may sit between the reader and the first paint. The tag itself is
 * `async`, so it competes for bandwidth and never for the main thread.
 *
 * It no-ops entirely when `VITE_GA_ID` is unset, which is every dev server and
 * every build that has not been given the ID — so a local session cannot post
 * page views into the production property. The `<meta>` CSP is widened by the
 * same variable in `vite.config.ts`, so the grant and the script arrive
 * together or neither does.
 */
startAnalytics()
