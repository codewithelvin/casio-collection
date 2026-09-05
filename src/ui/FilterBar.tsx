import { useMemo } from 'react'
import { Button, Checkbox, Grid, Popover, Select, Tag, Typography, theme as antdTheme } from 'antd'
import DownOutlined from '@ant-design/icons/DownOutlined'
import CloseOutlined from '@ant-design/icons/CloseOutlined'
import type { BrowseModel } from '../catalog/schema.ts'
import {
  activeFilters,
  facetsFor,
  NO_FILTERS,
  SORTS,
  toggleFilter,
  type Facet,
  type SortKey,
  type ViewState,
} from '../catalog/filters.ts'
import { facetLabel, facetValueLabel, sortLabel, t } from '../i18n/strings'

/**
 * FR-1.3 / FR-1.3a — the filter bar.
 *
 * It is **built from the models in view at render time and never hard-coded**
 * (D26). A line whose watches nobody has dated shows no year control; the one
 * series inside it where every module is known shows a movement control the
 * line page cannot. The bar changing shape as the catalogue fills is intended,
 * and is why there is no list of facets anywhere in this file.
 *
 * `models` is the view **before** filtering, on purpose. Recomputing the
 * options from the filtered result narrows the bar to whatever was just chosen,
 * and then the only way back to the other years is the control that clears
 * everything.
 */
export function FilterBar({
  models,
  state,
  onChange,
  /**
   * FR-6.2 — the collection offers a fourth order, *date added*, and no other
   * screen does. A prop with the catalogue's list as its default rather than a
   * module read, for the same reason §8.9 gives `AUTH_METHODS` to the sign-in
   * modal that way: the other branch stays testable without mutating a constant.
   */
  sorts = SORTS,
}: {
  models: readonly BrowseModel[]
  state: ViewState
  onChange: (next: ViewState) => void
  sorts?: readonly SortKey[]
}) {
  const { token } = antdTheme.useToken()
  const screens = Grid.useBreakpoint()
  const facets = useMemo(() => facetsFor(models), [models])
  const chips = activeFilters(state.filters)

  // §8.2 — below 768 px every interactive element is at least 44 px tall. The
  // controls stay visually small on a desktop row; on a phone they grow into a
  // thumb rather than becoming a second, smaller set of things to miss.
  const touch = screens.md ? undefined : 44

  // No facet earned its place and nothing is selected: there is nothing to
  // filter by and nothing to clear, so the bar is not a row of disabled
  // controls — it is absent.
  if (facets.length === 0 && chips.length === 0) return null

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        {facets.map((facet) => (
          <FacetControl
            key={facet.field}
            facet={facet}
            selected={state.filters[facet.field]}
            height={touch}
            onToggle={(value) =>
              onChange({ ...state, filters: toggleFilter(state.filters, facet.field, value) })
            }
          />
        ))}

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            // Pushed to the end of a desktop row, and allowed to wrap under the
            // facets on a phone. That is the whole of §8.2 for this component.
            marginInlineStart: 'auto',
          }}
        >
          <Typography.Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
            {t('filter.sort')}
          </Typography.Text>
          <Select
            size={screens.md ? 'small' : 'middle'}
            // The visible word beside it is not a `<label>` — AntD's Select is
            // not a native control, so nothing binds them. This is what a screen
            // reader reads.
            aria-label={t('filter.sort')}
            value={state.sort}
            onChange={(sort) => onChange({ ...state, sort })}
            options={sorts.map((sort) => ({ value: sort, label: sortLabel(sort) }))}
            style={{ minWidth: 168, height: touch }}
          />
        </div>
      </div>

      {chips.length > 0 ? (
        <div
          style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4, marginTop: 8 }}
        >
          {chips.map(({ field, value }) => {
            const label = facetValueLabel(field, value)
            return (
              <Chip
                key={`${field}:${value}`}
                label={label}
                height={touch}
                onRemove={() =>
                  onChange({ ...state, filters: toggleFilter(state.filters, field, value) })
                }
              />
            )
          })}

          <Button
            type="link"
            size="small"
            style={{ minHeight: touch }}
            onClick={() => onChange({ ...state, filters: NO_FILTERS })}
          >
            {t('filter.clearAll')}
          </Button>
        </div>
      ) : null}
    </div>
  )
}

/**
 * FR-1.3's removable chip. **The whole chip is the control**, not a 10 px × at
 * the end of it: on a phone a close icon inside a tag is a target smaller than
 * the finger pressing it, and §8.2 does not carve out an exception for small
 * things. The transparent padding gives the 44 px while the tag itself stays
 * the size a tag should be.
 *
 * It carries its own name — *Remove Digital*, not a bare × — because a row of
 * six identical unlabelled buttons is unusable with a screen reader and barely
 * better with a mouse.
 */
function Chip({
  label,
  height,
  onRemove,
}: {
  label: string
  height: number | undefined
  onRemove: () => void
}) {
  return (
    <button
      type="button"
      aria-label={`${t('filter.remove')} ${label}`}
      onClick={onRemove}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        minHeight: height,
        padding: 0,
        border: 'none',
        background: 'none',
        cursor: 'pointer',
      }}
    >
      <Tag style={{ marginInlineEnd: 0, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        {label}
        <CloseOutlined style={{ fontSize: 10 }} />
      </Tag>
    </button>
  )
}

function FacetControl({
  facet,
  selected,
  height,
  onToggle,
}: {
  facet: Facet
  selected: string[]
  height: number | undefined
  onToggle: (value: string) => void
}) {
  const { token } = antdTheme.useToken()
  const label = facetLabel(facet.field)

  return (
    <Popover
      trigger="click"
      placement="bottomLeft"
      content={
        // Year can legitimately run to thirty values on a line page, so the list
        // scrolls rather than growing past the fold.
        <div style={{ maxHeight: 320, overflowY: 'auto', paddingInlineEnd: 8 }}>
          {facet.options.map((option) => (
            <div key={option.value} style={{ padding: '2px 0' }}>
              <Checkbox
                checked={selected.includes(option.value)}
                onChange={() => onToggle(option.value)}
              >
                {facetValueLabel(facet.field, option.value)}
                <span style={{ color: token.colorTextTertiary, marginInlineStart: 6 }}>
                  {option.count}
                </span>
              </Checkbox>
            </div>
          ))}
        </div>
      }
    >
      <Button size="small" style={{ minHeight: height }}>
        {selected.length > 0 ? `${label} · ${selected.length}` : label}
        <DownOutlined style={{ fontSize: 10 }} />
      </Button>
    </Popover>
  )
}
