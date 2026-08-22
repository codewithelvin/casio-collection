import { t } from '../i18n/strings'

/**
 * §8.5 — the rail while it is still arriving.
 *
 * Eight bars at the height a rail row is, so the rail occupies the space it is
 * about to fill and nothing moves when the catalogue index lands.
 *
 * It was AntD's `Skeleton` and is now eight divs, which is what §12's rule
 * amounts to in the smallest possible case: `antd/skeleton` is 20 KB in the
 * entry chunk for a grey box that pulses, and it was in the entry chunk *because
 * of this file* — the shell renders on every URL, so the placeholder for the rail
 * was in the first load of all 3 000-odd of them.
 */
export function RailSkeleton() {
  return (
    <div className="cc-rail-skeleton" aria-busy="true" aria-label={t('state.loading')}>
      {Array.from({ length: 8 }, (_, index) => (
        <div key={index} className="cc-skeleton-bar" />
      ))}
    </div>
  )
}
