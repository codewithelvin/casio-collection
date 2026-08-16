import { useParams } from 'react-router-dom'
import { Placeholder } from '../../ui/Placeholder'

/**
 * M8: /u/<handle>, read-only and fully public (FR-7.4).
 * FR-7.5 — an unknown handle and a private one must render the same neutral
 * not-found page. That distinction is a real requirement, not a nicety.
 */
export default function ProfileRoute() {
  const { handle } = useParams<{ handle: string }>()
  return <Placeholder titleKey="route.profile.title" detail={handle} />
}
