import { useOnline, usePwaStore } from '../pwa/offline.ts'
import { t } from '../i18n/strings'

/**
 * FR-11.7 — "**offline state is shown once, calmly, in the header** — not as a
 * toast on every action."
 *
 * Once, and calmly, are both requirements. A toast per action is what an app
 * does when it has not decided what offline means; this has decided (D33), so
 * it states the rule in one line and gets out of the way. It has no icon and no
 * colour, because being on a train is not an error — it was an AntD `Alert` with
 * `type="warning"` and even the amber was more alarm than the fact deserves.
 *
 * FR-11.2's update prompt shares this strip for the same reason: both are
 * facts about the connection rather than about the page, and two separate
 * announcements in two places is how a header becomes noise.
 *
 * `role="status"` rather than `alert`: it is polite, so a screen reader finishes
 * the sentence it was reading before mentioning the network.
 */
export function OfflineBar() {
  const online = useOnline()
  const updateReady = usePwaStore((state) => state.updateReady)
  const applyUpdate = usePwaStore((state) => state.applyUpdate)

  if (!online) {
    return (
      <div className="cc-notice" role="status">
        <span>
          <strong>{t('offline.title')}</strong> {t('offline.body')}
        </span>
      </div>
    )
  }

  if (updateReady) {
    return (
      <div className="cc-notice" role="status">
        <span>{t('update.available')}</span>
        <button type="button" className="cc-button cc-button-primary" onClick={applyUpdate}>
          {t('update.action')}
        </button>
      </div>
    )
  }

  return null
}
