import type { ReactNode } from 'react'
import { useEffect } from 'react'
import { Alert, Breadcrumb, Card, Descriptions, Tag, Typography, theme as antdTheme } from 'antd'
import ExportOutlined from '@ant-design/icons/ExportOutlined'
import ProfileOutlined from '@ant-design/icons/ProfileOutlined'
import SafetyCertificateOutlined from '@ant-design/icons/SafetyCertificateOutlined'
import AppstoreOutlined from '@ant-design/icons/AppstoreOutlined'
import CalendarOutlined from '@ant-design/icons/CalendarOutlined'
import EyeOutlined from '@ant-design/icons/EyeOutlined'
import SyncOutlined from '@ant-design/icons/SyncOutlined'
import BarcodeOutlined from '@ant-design/icons/BarcodeOutlined'
import BorderOutlined from '@ant-design/icons/BorderOutlined'
import ColumnWidthOutlined from '@ant-design/icons/ColumnWidthOutlined'
import ColumnHeightOutlined from '@ant-design/icons/ColumnHeightOutlined'
import DashboardOutlined from '@ant-design/icons/DashboardOutlined'
import ExperimentOutlined from '@ant-design/icons/ExperimentOutlined'
import BgColorsOutlined from '@ant-design/icons/BgColorsOutlined'
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

      <SectionHeading icon={<ProfileOutlined />} text={t('watch.specs')} />
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
      <SectionHeading icon={<SafetyCertificateOutlined />} text={t('watch.sourceHeading')} />
      <Typography.Paragraph>
        <a href={model.source.url} target="_blank" rel="noreferrer noopener">
          {sourceLabel(model.source.kind)} <ExportOutlined />
        </a>
      </Typography.Paragraph>

      {/* FR-3.4 — the rest of the series, excluding this model.
          FR-3.4 originally specified a horizontally scrollable strip. The client
          looked at it built and called it not web friendly, which is fair: a
          sideways scrollbar on a desktop page is a mouse-wheel dead end, and
          eighteen F-91W colourways meant most of them were off-screen with
          nothing saying so. This wraps instead — `auto-fill` gives the strip on
          a phone and a tidy block on a laptop, from one rule and with no
          breakpoint. Revised 2026-08-16 at the client's request. */}
      {others.length > 0 ? (
        <>
          <SectionHeading icon={<AppstoreOutlined />} text={t('watch.otherInSeries')} />
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(148px, 1fr))',
              gap: 12,
            }}
          >
            {others.map((other) => (
              <Link key={other.id} to={`/watch/${other.id}`} aria-label={other.ref}>
                <Card
                  hoverable
                  size="small"
                  style={{ height: '100%', borderTop: `3px solid ${accent}` }}
                  styles={{ body: { padding: 0 } }}
                >
                  {/* The same typographic tile as the grid, in miniature, so the
                      strip reads as the catalogue rather than as a list of
                      links. §8.6 all the way down. */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '18px 8px',
                      background: `${accent}14`,
                      fontFamily: token.fontFamilyCode,
                      fontSize: 14,
                      fontWeight: 600,
                      wordBreak: 'break-word',
                      textAlign: 'center',
                      color: token.colorText,
                    }}
                  >
                    {other.ref}
                  </div>
                  {other.colorway || other.year ? (
                    <div style={{ padding: '8px 10px' }}>
                      <Typography.Paragraph
                        type="secondary"
                        ellipsis={{ rows: 2 }}
                        style={{ fontSize: 12, marginBottom: 0 }}
                      >
                        {other.colorway ?? String(other.year)}
                      </Typography.Paragraph>
                    </div>
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
  const rows: { key: string; label: ReactNode; children: string }[] = []

  // The icon sits with the label, not the value. A spec table is scanned down
  // the left edge for the row you want, and a glyph per row is what makes that
  // a glance instead of a read — which matters most on the models carrying two
  // rows and the ones carrying ten, both of which exist here.
  const push = (
    key: string,
    icon: ReactNode,
    label: string,
    value: string | number | undefined | null,
  ) => {
    if (value === undefined || value === null || value === '') return
    rows.push({
      key,
      label: (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <Glyph>{icon}</Glyph>
          {label}
        </span>
      ),
      children: String(value),
    })
  }

  push('year', <CalendarOutlined />, t('spec.year'), model.year)
  push(
    'display',
    <EyeOutlined />,
    t('spec.display'),
    model.display ? displayLabel(model.display) : undefined,
  )
  push(
    'movement',
    <SyncOutlined />,
    t('spec.movement'),
    model.movement ? movementLabel(model.movement) : undefined,
  )
  push('module', <BarcodeOutlined />, t('spec.module'), model.module)
  push('material', <BorderOutlined />, t('spec.case.material'), model.case?.material)
  push(
    'width',
    <ColumnWidthOutlined />,
    t('spec.case.width_mm'),
    model.case?.width_mm && `${model.case.width_mm} mm`,
  )
  push(
    'height',
    <ColumnHeightOutlined />,
    t('spec.case.height_mm'),
    model.case?.height_mm && `${model.case.height_mm} mm`,
  )
  push(
    'depth',
    <ColumnWidthOutlined />,
    t('spec.case.depth_mm'),
    model.case?.depth_mm && `${model.case.depth_mm} mm`,
  )
  push(
    'weight',
    <DashboardOutlined />,
    t('spec.case.weight_g'),
    model.case?.weight_g && `${model.case.weight_g} g`,
  )
  push(
    'wr',
    <ExperimentOutlined />,
    t('spec.water_resistance_m'),
    model.water_resistance_m === undefined ? undefined : `${model.water_resistance_m} m`,
  )
  push('colorway', <BgColorsOutlined />, t('spec.colorway'), model.colorway)
  return rows
}

/**
 * A glyph that is decoration and nothing else.
 *
 * AntD renders every icon as `role="img"` with an `aria-label` of its own name,
 * so an unwrapped icon inside a heading makes that heading announce
 * "appstore Other models in this series" — and makes a test querying the
 * heading by name fail for a reason that has nothing to do with the heading.
 * Every icon added for looks goes through here.
 */
function Glyph({ children }: { children: ReactNode }) {
  return (
    <span aria-hidden="true" style={{ display: 'inline-flex' }}>
      {children}
    </span>
  )
}

/** A section heading with its glyph, so the page is scannable by shape. */
function SectionHeading({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <Typography.Title
      level={4}
      style={{ marginTop: 24, display: 'flex', alignItems: 'center', gap: 10 }}
    >
      <Glyph>{icon}</Glyph>
      {text}
    </Typography.Title>
  )
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
