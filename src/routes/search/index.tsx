import { useSearchParams } from 'react-router-dom'
import { Placeholder } from '../../ui/Placeholder'

/**
 * M3: normalised in-browser matching (FR-2.2, FR-2.4).
 * The term already lives in the URL (FR-1.6), so M3 adds matching, not plumbing.
 */
export default function SearchRoute() {
  const [params] = useSearchParams()
  const term = params.get('q') ?? undefined
  return <Placeholder titleKey="route.search.title" detail={term} />
}
