import { Alert, Button } from 'antd'
import { useOnline, usePwaStore } from '../pwa/offline.ts'
import { t } from '../i18n/strings'

/**
 * FR-11.7 — "**offline state is shown once, calmly, in the header** — not as a
 * toast on every action."
 *
 * Once, and calmly, are both requirements. A toast per action is what an app
 * does when it has not decided what offline means; this has decided (D33), so
 * it states the rule in one line and gets out of the way. It is an `Alert`
 * rather than a banner with an icon and a colour, because being on a train is
 * not an error.
 *
 * FR-11.2's update prompt shares this strip for the same reason: both are
 * facts about the connection rather than about the page, and two separate
 * announcements in two places is how a header becomes noise.
 */
export function OfflineBar() {
  const online = useOnline()
  const updateReady = usePwaStore((state) => state.updateReady)
  const applyUpdate = usePwaStore((state) => state.applyUpdate)

  if (!online) {
    return (
      <Alert
        type="warning"
        showIcon
        banner
        message={t('offline.title')}
        description={t('offline.body')}
        style={{ paddingBlock: 6 }}
      />
    )
  }

  if (updateReady) {
    return (
      <Alert
        type="info"
        showIcon
        banner
        message={t('update.available')}
        style={{ paddingBlock: 6 }}
        action={
          <Button size="small" type="primary" onClick={applyUpdate}>
            {t('update.action')}
          </Button>
        }
      />
    )
  }

  return null
}
