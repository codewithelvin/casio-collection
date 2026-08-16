import { useParams } from 'react-router-dom'
import { Placeholder } from '../../ui/Placeholder'

/** M2: the series grid (FR-1.2). The series is a reference prefix (D32). */
export default function SeriesRoute() {
  const { line, series } = useParams<{ line: string; series: string }>()
  return <Placeholder titleKey="route.series.title" detail={[line, series].filter(Boolean).join(' / ')} />
}
