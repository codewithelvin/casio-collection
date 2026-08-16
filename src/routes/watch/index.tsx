import { useParams } from 'react-router-dom'
import { Placeholder } from '../../ui/Placeholder'

/** M2: the detail page (§3.3). The deep link that must survive a refresh (D13). */
export default function WatchRoute() {
  const { modelId } = useParams<{ modelId: string }>()
  return <Placeholder titleKey="route.watch.title" detail={modelId} />
}
