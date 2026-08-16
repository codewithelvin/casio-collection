import { useParams } from 'react-router-dom'
import { Placeholder } from '../../ui/Placeholder'

/** M2: every model in the line, grouped by series with a sticky sub-heading (FR-1.2). */
export default function LineRoute() {
  const { line } = useParams<{ line: string }>()
  return <Placeholder titleKey="route.line.title" detail={line} />
}
