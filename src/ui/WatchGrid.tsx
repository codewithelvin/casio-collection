import { Col, Row } from 'antd'
import type { PublishedModel, PublishedSeries } from '../catalog/schema.ts'
import { WatchCard } from './WatchCard'

/**
 * §8.5 — the grid. AntD `Row`/`Col`, `gutter={[16,16]}`, responsive spans
 * straight out of §8.2's table.
 *
 * The spans are the table read into AntD's 24 columns: 12 → 2 up, 8 → 3 up,
 * 6 → 4 up, 4 → 6 up. `md` is 768 and `xl` is 1200, which are the two numbers
 * §8.2 actually names, so the breakpoints are the specification rather than an
 * approximation of it.
 *
 * There is no virtualisation, and §8.5 explains why: no Casio series comes near
 * the 200 models the windowing rule was written for, so the rule could never
 * fire. The largest series in the catalogue today is eighteen.
 */
export const GRID_SPANS = { xs: 12, md: 8, lg: 6, xl: 4 } as const
export const GRID_GUTTER: [number, number] = [16, 16]

export function WatchGrid({
  models,
  seriesById,
  accent,
}: {
  models: readonly PublishedModel[]
  seriesById?: Map<string, PublishedSeries> | undefined
  accent?: string | undefined
}) {
  return (
    <Row gutter={GRID_GUTTER}>
      {models.map((model) => (
        <Col key={model.id} {...GRID_SPANS}>
          <WatchCard
            model={model}
            seriesName={seriesById?.get(model.series)?.name}
            accent={accent}
          />
        </Col>
      ))}
    </Row>
  )
}
