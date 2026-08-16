import { useEffect } from 'react'
import { Alert, Breadcrumb, Card, Descriptions, Tag, Typography, theme as antdTheme } from 'antd'
import ExportOutlined from '@ant-design/icons/ExportOutlined'
import { Link, useParams } from 'react-router-dom'
import {
  imageSources,
  modelById,
  otherModelsInSeries,
  seriesById,
  useCatalog,
} from '../../catalog/client.ts'
import type { Catalog, PublishedModel } from '../../catalog/schema.ts'
import { ErrorState } from '../../ui/ErrorState'
import { EmptyState } from '../../ui/EmptyState'
import { LINE_ACCENTS } from '../../theme/tokens'
import { displayLabel, featureLabel, movementLabel, sourceLabel, t } from '../../i18n/strings'

/**
 * FR-3 — the watch page.
 *
 * The whole of FR-3.2 is one rule: **render only the fields the model actually
 * carries**. A missing field is omitted, never shown empty and never "N/A", and
 * under D27 the table may legitimately be empty — five of the sixty-one models
 * here carry nothing beyond a reference, a module and a source. So the empty
 * table has a sentence of its own rather than being a blank panel, because a
 * reader who sees nothing needs to be told the difference between *this watch
 * has no features* and *nobody has looked yet*.
 */
export default function WatchRoute() {
  const { modelId } = useParams<{ modelId: string }>()
  const { data, isPending, isError, refetch } = useCatalog()

  const model = data ? modelById(data, modelId) : undefined
  const series = data && model ? seriesById(data, model.series) : undefined

  // FR-3.7 — the title and the card tags, so a pasted link previews as the
  // reference rather than as the site name. Restored on unmount: leaving a watch
  // page for the catalogue root must not leave that watch's title behind.
  useEffect(() => {
    if (!model) return
    const previous = document.title
    const name = [model.ref, model.name].filter(Boolean).join(' — ')
    document.title = `${name} · ${t('app.name')}`
    setMeta('og:title', name)
    return () => {
      document.title = previous
    }
  }, [model])

  if (isPending) return <WatchSkeleton />
  if (isError || !data) return <ErrorState onRetry={() => void refetch()} />

  if (!model) {
    return <EmptyState title={t('watch.notFound.title')} body={t('watch.notFound.body')} />
  }

  return <WatchDetail catalog={data} model={model} seriesName={series?.name} />
}

function WatchDetail({
  catalog,
  model,
  seriesName,
}: {
  catalog: Catalog
  model: PublishedModel
  seriesName: string | undefined
}) {
  const { token } = antdTheme.useToken()
  const line = catalog.lines.find((candidate) => candidate.id === model.line)
  const accent = LINE_ACCENTS[model.line] ?? token.colorPrimary
  const sources = imageSources(model.image)
  const others = otherModelsInSeries(catalog, model)

  const rows = specRows(model)

  return (
    <div style={{ maxWidth: 1080 }}>
      <Breadcrumb
        style={{ marginBottom: 8 }}
        items={[
          { title: <Link to="/">{t('home.linesHeading')}</Link> },
          ...(line ? [{ title: <Link to={`/line/${line.slug}`}>{line.name}</Link> }] : []),
          ...(line && seriesName
            ? [{ title: <Link to={`/line/${line.slug}/${model.series}`}>{seriesName}</Link> }]
            : []),
          { title: model.ref },
        ]}
      />

      {/* FR-3.6 — a tombstoned entry stays reachable forever and says so. */}
      {model.tombstone ? (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message={t('watch.tombstone.title')}
          description={
            <>
              <div>{model.tombstone.reason}</div>
              {model.tombstone.replaced_by ? (
                <Link to={`/watch/${model.tombstone.replaced_by}`}>
                  {t('watch.tombstone.replacedBy')}
                </Link>
              ) : null}
            </>
          }
        />
      ) : null}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, marginBottom: 24 }}>
        <div style={{ flex: '0 1 320px', minWidth: 240 }}>
          {sources ? (
            <img
              src={sources.src}
              srcSet={sources.srcSet}
              alt={model.ref}
              width={400}
              height={400}
              decoding="async"
              style={{ width: '100%', aspectRatio: '1 / 1', objectFit: 'contain' }}
            />
          ) : (
            // §8.6 — the same designed primary state as the card, at the larger
            // size. Not a placeholder for a photograph that is coming.
            <div
              style={{
                aspectRatio: '1 / 1',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                padding: 16,
                textAlign: 'center',
                background: `${accent}14`,
                borderRadius: token.borderRadiusLG,
              }}
            >
              <span
                style={{
                  fontFamily: token.fontFamilyCode,
                  fontSize: 'clamp(22px, 6vw, 40px)',
                  fontWeight: 600,
                  lineHeight: 1.1,
                  wordBreak: 'break-word',
                }}
              >
                {model.ref}
              </span>
              {seriesName ? (
                <span style={{ color: token.colorTextTertiary }}>{seriesName}</span>
              ) : null}
            </div>
          )}
        </div>

        <div style={{ flex: '1 1 360px', minWidth: 260 }}>
          <Typography.Title
            level={2}
            style={{ marginTop: 0, marginBottom: 4, fontFamily: token.fontFamilyCode }}
          >
            {model.ref}
          </Typography.Title>
          {model.name ? (
            <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
              {model.name}
            </Typography.Paragraph>
          ) : null}

          {/* FR-3.5 — marked as leaving the site, and only where one exists. */}
          {model.official_url ? (
            <Typography.Paragraph style={{ marginBottom: 8 }}>
              <a href={model.official_url} target="_blank" rel="noreferrer noopener">
                {t('watch.officialPage')} <ExportOutlined />
              </a>
            </Typography.Paragraph>
          ) : null}

          {/* FR-3.3's Owned One and Wishlist controls belong here. They arrive
              with M5, on top of M4's auth — see the note in WatchCard. */}
        </div>
      </div>

      <Typography.Title level={4}>{t('watch.specs')}</Typography.Title>
      {rows.length === 0 ? (
        <Typography.Paragraph type="secondary">{t('watch.noSpecs')}</Typography.Paragraph>
      ) : (
        <Descriptions bordered size="small" column={{ xs: 1, md: 2 }} items={rows} />
      )}

      {model.features?.length ? (
        <div style={{ marginTop: 16 }}>
          {model.features.map((feature) => (
            <Tag key={feature} style={{ marginBottom: 8 }}>
              {featureLabel(feature)}
            </Tag>
          ))}
        </div>
      ) : null}

      {/* FR-3.2a — what kind of page this was read off, linked to the page. */}
      <Typography.Title level={4} style={{ marginTop: 24 }}>
        {t('watch.sourceHeading')}
      </Typography.Title>
      <Typography.Paragraph>
        <a href={model.source.url} target="_blank" rel="noreferrer noopener">
          {sourceLabel(model.source.kind)} <ExportOutlined />
        </a>
      </Typography.Paragraph>

      {/* FR-3.4 — a horizontally scrollable strip, excluding this model. */}
      {others.length > 0 ? (
        <>
          <Typography.Title level={4} style={{ marginTop: 24 }}>
            {t('watch.otherInSeries')}
          </Typography.Title>
          <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8 }}>
            {others.map((other) => (
              <Link key={other.id} to={`/watch/${other.id}`} style={{ flex: '0 0 auto' }}>
                <Card
                  hoverable
                  size="small"
                  style={{ width: 160, borderTop: `3px solid ${accent}` }}
                  styles={{ body: { padding: 10 } }}
                >
                  <Typography.Text style={{ fontFamily: token.fontFamilyCode, fontSize: 13 }}>
                    {other.ref}
                  </Typography.Text>
                  {other.colorway ? (
                    <Typography.Paragraph
                      type="secondary"
                      ellipsis={{ rows: 2 }}
                      style={{ fontSize: 12, marginBottom: 0 }}
                    >
                      {other.colorway}
                    </Typography.Paragraph>
                  ) : null}
                </Card>
              </Link>
            ))}
          </div>
        </>
      ) : null}
    </div>
  )
}

/**
 * FR-3.2 — build the rows from what is present. Written as a list of
 * (label, value) pairs that skip themselves rather than as a template with
 * conditionals, so "omitted, never empty" is structural instead of remembered.
 */
function specRows(model: PublishedModel) {
  const rows: { key: string; label: string; children: string }[] = []
  const push = (key: string, label: string, value: string | number | undefined | null) => {
    if (value === undefined || value === null || value === '') return
    rows.push({ key, label, children: String(value) })
  }

  push('year', t('spec.year'), model.year)
  push('display', t('spec.display'), model.display ? displayLabel(model.display) : undefined)
  push('movement', t('spec.movement'), model.movement ? movementLabel(model.movement) : undefined)
  push('module', t('spec.module'), model.module)
  push('material', t('spec.case.material'), model.case?.material)
  push('width', t('spec.case.width_mm'), model.case?.width_mm && `${model.case.width_mm} mm`)
  push('height', t('spec.case.height_mm'), model.case?.height_mm && `${model.case.height_mm} mm`)
  push('depth', t('spec.case.depth_mm'), model.case?.depth_mm && `${model.case.depth_mm} mm`)
  push('weight', t('spec.case.weight_g'), model.case?.weight_g && `${model.case.weight_g} g`)
  push(
    'wr',
    t('spec.water_resistance_m'),
    model.water_resistance_m === undefined ? undefined : `${model.water_resistance_m} m`,
  )
  push('colorway', t('spec.colorway'), model.colorway)
  return rows
}

/** Loading geometry that matches the detail layout, not a generic spinner. */
function WatchSkeleton() {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, maxWidth: 1080 }}>
      <Card style={{ flex: '0 1 320px', minWidth: 240 }} loading />
      <Card style={{ flex: '1 1 360px', minWidth: 260 }} loading />
    </div>
  )
}

/** FR-3.7 — update an existing meta tag, or add one if the shell has none. */
function setMeta(property: string, content: string) {
  let tag = document.querySelector<HTMLMetaElement>(`meta[property="${property}"]`)
  if (!tag) {
    tag = document.createElement('meta')
    tag.setAttribute('property', property)
    document.head.appendChild(tag)
  }
  tag.setAttribute('content', content)
}
