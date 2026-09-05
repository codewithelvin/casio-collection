import type { ReactNode } from 'react'
import { useEffect } from 'react'
import {
  Alert,
  Breadcrumb,
  Card,
  Descriptions,
  Image,
  Tag,
  Typography,
  theme as antdTheme,
} from 'antd'
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
  editionById,
  imageSources,
  modelById,
  otherModelsInSeries,
  seriesById,
  useCatalog,
} from '../../catalog/client.ts'
import type {
  Catalog,
  ImageCredit,
  PublishedEdition,
  PublishedModel,
  PublishedSeries,
} from '../../catalog/schema.ts'
import { IMAGE_LICENCE_URLS, isLicensed } from '../../catalog/vocabulary.ts'
import { ErrorState } from '../../ui/ErrorState'
import { EmptyState } from '../../ui/EmptyState'
import { OwnershipControls } from '../../ui/OwnershipControls'
import { ImproveEntry } from '../../ui/ImproveEntry'
import { NoteEditor } from '../../ui/NoteEditor'
import { useOwnership } from '../../collection/mutations.ts'
import { LINE_ACCENTS } from '../../theme/palette.ts'
import { editionPath, linePath, seriesPath, watchPath } from '../../paths.ts'
import {
  availabilityLabel,
  displayLabel,
  featureLabel,
  imageLicenceLabel,
  movementLabel,
  sourceLabel,
  t,
} from '../../i18n/strings'

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

  return <WatchDetail catalog={data} model={model} series={series} />
}

function WatchDetail({
  catalog,
  model,
  series,
}: {
  catalog: Catalog
  model: PublishedModel
  /** Absent only if the artefact carries a model whose series was not published. */
  series: PublishedSeries | undefined
}) {
  const { token } = antdTheme.useToken()
  const line = catalog.lines.find((candidate) => candidate.id === model.line)
  const edition = editionById(catalog, model.edition)
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
          ...(line ? [{ title: <Link to={linePath(line.slug)}>{line.name}</Link> }] : []),
          ...(line && series
            ? [{ title: <Link to={seriesPath(line.slug, series.id)}>{series.name}</Link> }]
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
                <Link to={watchPath(model.tombstone.replaced_by)}>
                  {t('watch.tombstone.replacedBy')}
                </Link>
              ) : null}
            </>
          }
        />
      ) : null}

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 24,
          marginBottom: 24,
          // Without this the short column stretches to the tall one's height and
          // the photograph floats in the middle of its own half.
          alignItems: 'flex-start',
        }}
      >
        <div style={{ flex: '0 1 320px', minWidth: 240 }}>
          {sources ? (
            <>
              {/* Click to enlarge. A catalogue photograph is the one thing on
                  this page a collector wants closer — the dial text, the case
                  finish, the exact shade of a colourway — and the 2× file is
                  already downloaded for the retina case, so the larger view
                  costs nothing to serve. */}
              <Image
                src={sources.src}
                srcSet={sources.srcSet}
                alt={model.ref}
                width="100%"
                height="auto"
                decoding="async"
                preview={{ mask: t('watch.zoom') }}
                style={{ aspectRatio: '1 / 1', objectFit: 'contain' }}
              />
              <ImageCreditLine credit={model.image_credit} />
            </>
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
              {series ? (
                <span style={{ color: token.colorTextTertiary }}>{series.name}</span>
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

          {/* Which series this reference belongs to, and what collectors call it.
              The breadcrumb already names the series, but a breadcrumb is
              navigation furniture read as a path back — it does not say *this
              watch is an F-91W* and it cannot carry the `aka` names at all. Those
              are the point of showing this here: FR-2.1 makes "F91W" and
              "Marlin" searchable, and the series page is the only place that
              currently teaches a reader those words exist. Absent on most
              series, which is normal, and the whole line disappears with the
              series record rather than rendering a label with nothing after it
              (D27). */}
          {series ? <SeriesLine series={series} lineSlug={line?.slug} /> : null}

          {/* D62 — and it goes directly under the series for the reason the
              series line is here at all: this is what the watch *is*, not what
              it measures. On the thirteen references that carry one it is the
              most interesting fact on the page — nobody looks up A168WEPC-7A,
              they look up the Pac-Man one — and on every other reference the
              line is simply absent, which is D27 holding for a field a reader
              would otherwise read a "no" into. */}
          {edition ? <EditionLine edition={edition} model={model} /> : null}

          {/* D59 — availability, beside the reference rather than buried in the
              specification table. It is the first thing a collector asks of a
              Casio and the answer changes what they do next: *currently listed*
              is a shopping decision, *no longer listed* is a hunt.

              A pill and not a spec row because it is not a specification — the
              case width is a property of the watch, this is a fact about Casio's
              catalogue on the day it was measured. `undefined` renders nothing
              at all, which is D27's rule holding for a field the reader would
              otherwise read a `false` into. */}
          {model.discontinued !== undefined ? (
            <Typography.Paragraph style={{ marginBottom: 8 }}>
              {/* `default` and not an absent `color`: under
                  exactOptionalPropertyTypes an undefined prop is a type error,
                  and `default` is the neutral tag rather than a red one. Nothing
                  here is a warning — most of this catalogue is discontinued and
                  that is the point of the site, not a problem with the watch. */}
              <Tag color={model.discontinued ? 'default' : 'green'} style={{ marginInlineEnd: 0 }}>
                {availabilityLabel(model.discontinued)}
              </Tag>
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

          {/* FR-3.3 / FR-4.1 — the Owned One and Wishlist controls, above the
              specification rather than below it. A collector who came here from
              a grid has already decided; making them read a table of case
              dimensions first puts the page's furniture in front of its point.
              Capped in width because a full-bleed primary button beside a
              photograph reads as a banner. */}
          <div style={{ maxWidth: 320, marginBottom: 8 }}>
            <OwnershipControls model={model} size="large" />
          </div>

          {/* FR-5.1 — the note belongs to the mark, so it appears with one and
              not before. This is where the room is: a textarea on a 170 px card
              in a grid would be a field nobody can write a sentence in. */}
          <MarkedNote model={model} />

          {/* The specification lives **beside** the picture, not under it. It
              read the other way until M3 and the cost was only visible once
              there were photographs to look at: a 320 px image left the whole
              right-hand half of a laptop screen empty while the table it should
              have been sitting next to queued up underneath. The wrap does the
              responsive work — one column on a phone, two side by side from
              about 700 px, and no breakpoint written down anywhere. */}
          <SectionHeading icon={<ProfileOutlined />} text={t('watch.specs')} />
          {rows.length === 0 ? (
            <Typography.Paragraph type="secondary">{t('watch.noSpecs')}</Typography.Paragraph>
          ) : (
            /* One column, not a responsive pair. `column` is resolved against
               the **window** and not against the element, so a two-column table
               inside a 380 px panel on a 1440 px screen breaks "1989" into four
               stacked digits — correct by AntD's rules and unreadable. */
            <Descriptions bordered size="small" column={1} items={rows} />
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
          <Typography.Paragraph style={{ marginBottom: 0 }}>
            <a href={model.source.url} target="_blank" rel="noreferrer noopener">
              {sourceLabel(model.source.kind)} <ExportOutlined />
            </a>
          </Typography.Paragraph>

          {/* Directly under the source, which is the argument for putting it
              here: the reader has just been told what this entry was read off
              and how thin that page was. The offer to improve it belongs in the
              same breath, and nowhere near the Owned button — one is a fact
              about the reader's shelf and the other is a fact about the watch. */}
          <ImproveEntry model={model} />
        </div>
      </div>

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
              <Link key={other.id} to={watchPath(other.id)} aria-label={other.ref}>
                <Card
                  hoverable
                  size="small"
                  style={{ height: '100%', borderTop: `3px solid ${accent}` }}
                  styles={{ body: { padding: 0 } }}
                >
                  {/* §8.6 all the way down: the photograph where there is one,
                      the typographic tile where there is not. Until D41 there
                      never was one, so this was written as a tile and nothing
                      revealed the omission — a strip of tiles under a page with
                      a photograph on it reads as a different catalogue. */}
                  <OtherTile model={other} accent={accent} />
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
 * The series a reference sits in, linked to the series page, plus the names
 * collectors use for it where the series carries any.
 *
 * Deliberately **not** a row in the specification table. That table is what was
 * read off `source` — properties of the watch — and D27's empty state depends on
 * it: five of the models here carry nothing beyond a reference, a module and a
 * source, and the table being empty is what makes `watch.noSpecs` say *nobody
 * has looked yet*. A Series row would fill every table on the site and quietly
 * retire that sentence, which is the one thing on the page that distinguishes an
 * unsourced watch from a plain one.
 *
 * The link is dropped rather than guessed when the line is not published, for
 * the same reason the breadcrumb drops its segment: `/line/undefined/f-91w` is a
 * 404 dressed as a link.
 */
function SeriesLine({
  series,
  lineSlug,
}: {
  series: PublishedSeries
  lineSlug: string | undefined
}) {
  const { token } = antdTheme.useToken()

  return (
    <Typography.Paragraph style={{ marginBottom: 8 }}>
      <span style={{ color: token.colorTextTertiary, marginInlineEnd: 8 }}>{t('spec.series')}</span>
      {lineSlug ? <Link to={seriesPath(lineSlug, series.id)}>{series.name}</Link> : series.name}
      {/* FR-2.1's other names for the same watch. Tags, matching the series
          page, so the two screens teach the same vocabulary the same way. */}
      {series.aka?.map((alias) => (
        <Tag key={alias} style={{ marginInlineStart: 8 }}>
          {alias}
        </Tag>
      ))}
    </Typography.Paragraph>
  )
}

/**
 * D62 — the edition this reference was released in, linked to its page.
 *
 * Not a specification row, for exactly the reason `SeriesLine` gives: that table
 * is what was read off `source`, and D27's empty state depends on it staying
 * that way. An edition is not a property of the watch that somebody measured —
 * it is who made it with whom.
 *
 * **`edition_source` renders as a link beside the name**, the way a `year_source`
 * does under D54 and for the same reason. Every other fact on this page came
 * from the page in `source`, and a reader is entitled to assume that. Where the
 * membership was established somewhere else — a Casio capture in a different
 * locale that carries the licence line this one does not — saying so is what
 * keeps it a citation rather than a quiet merge of two pages into one entry.
 */
function EditionLine({ edition, model }: { edition: PublishedEdition; model: PublishedModel }) {
  const { token } = antdTheme.useToken()

  return (
    <Typography.Paragraph style={{ marginBottom: 8 }}>
      <span style={{ color: token.colorTextTertiary, marginInlineEnd: 8 }}>
        {t('spec.edition')}
      </span>
      <Link to={editionPath(edition.slug)}>{edition.name}</Link>
      {model.edition_source ? (
        <a
          href={model.edition_source}
          target="_blank"
          rel="noreferrer noopener"
          style={{ fontSize: '0.875em', marginInlineStart: 8 }}
        >
          {t('spec.edition.source')}
        </a>
      ) : null}
    </Typography.Paragraph>
  )
}

/**
 * FR-5.1 — "a signed-in user **who has marked a watch** may attach one note".
 *
 * The condition is the component. Rendering the editor unconditionally would
 * offer a field with nowhere to store what is typed in it — the note is a column
 * on the collection row, so with no row there is no note, and `setCollectionNote`
 * would update nothing and report success.
 */
function MarkedNote({ model }: { model: PublishedModel }) {
  const { status } = useOwnership(model)
  if (status === null) return null
  return <NoteEditor model={model} />
}

/**
 * FR-3.2 — build the rows from what is present. Written as a list of
 * (label, value) pairs that skip themselves rather than as a template with
 * conditionals, so "omitted, never empty" is structural instead of remembered.
 */
function specRows(model: PublishedModel) {
  // `children` is a node rather than a string because one row can carry a link:
  // a year read off a different page than the specifications names that page
  // (D54), the way the photograph already names its own.
  const rows: { key: string; label: ReactNode; children: ReactNode }[] = []

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

  /**
   * D54 — a year read off a page this entry does not otherwise cite says so.
   *
   * Every other row here comes from `source`, and a reader is entitled to assume
   * that. A year may now come from Casio's dated news release while the
   * specifications come from the product page, and the one thing that keeps
   * that honest rather than a quiet merge is showing which page said it — the
   * same argument `image_credit` already makes beneath the photograph.
   */
  if (model.year != null && model.year_source) {
    rows.push({
      key: 'year',
      label: (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <Glyph>
            <CalendarOutlined />
          </Glyph>
          {t('spec.year')}
        </span>
      ),
      children: (
        <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          {String(model.year)}
          <a
            href={model.year_source}
            target="_blank"
            rel="noreferrer noopener"
            style={{ fontSize: '0.875em' }}
          >
            {t('spec.year.source')}
          </a>
        </span>
      ),
    })
  } else {
    push('year', <CalendarOutlined />, t('spec.year'), model.year)
  }
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
/** FR-3.4's tile: the photograph at 148 px where there is one, the reference set
 *  in the mono face where there is not. Same rule as the card, same geometry. */
function OtherTile({ model, accent }: { model: PublishedModel; accent: string }) {
  const { token } = antdTheme.useToken()
  const sources = imageSources(model.image)

  if (sources) {
    return (
      <img
        src={sources.src}
        srcSet={sources.srcSet}
        alt={model.ref}
        loading="lazy"
        decoding="async"
        width={148}
        height={148}
        // `height: auto` for the same reason as the card — see WatchCard.
        style={{
          width: '100%',
          height: 'auto',
          aspectRatio: '1 / 1',
          objectFit: 'contain',
          display: 'block',
        }}
      />
    )
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        aspectRatio: '1 / 1',
        padding: '8px',
        background: `${accent}14`,
        fontFamily: token.fontFamilyCode,
        fontSize: 14,
        fontWeight: 600,
        wordBreak: 'break-word',
        textAlign: 'center',
        color: token.colorText,
      }}
    >
      {model.ref}
    </div>
  )
}

/**
 * FR-3.2b / D41 — the photograph says where it came from and on what footing.
 *
 * Some of these files are licensed to us by the person who took them and some
 * are used under D11 without a grant at all, and **the reader is told which**.
 * That is D27's argument applied to pictures: a catalogue that shows its
 * working can be corrected, and one that hides it cannot. *Photograph by* names
 * someone who licensed their work; *Photograph from* names a page a file was
 * taken off. Saying "by" over a borrowing would dress it up as a licence.
 *
 * The credit sits beneath the picture rather than in a list at the bottom of
 * the site, because for the licensed ones attribution is the term of use.
 */
function ImageCreditLine({ credit }: { credit: ImageCredit | undefined }) {
  const { token } = antdTheme.useToken()
  if (!credit) return null

  const licenceUrl = IMAGE_LICENCE_URLS[credit.licence]
  const licence = imageLicenceLabel(credit.licence)
  const lead = isLicensed(credit.licence) ? t('image.creditBy') : t('image.creditFrom')

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 8,
        marginTop: 8,
        fontSize: token.fontSizeSM,
        color: token.colorTextTertiary,
      }}
    >
      <a href={credit.url} target="_blank" rel="noopener noreferrer">
        {`${lead} ${credit.author}`}
      </a>
      {licenceUrl ? (
        <a href={licenceUrl} target="_blank" rel="noopener noreferrer">
          {licence}
        </a>
      ) : (
        <span>{licence}</span>
      )}
    </div>
  )
}

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
