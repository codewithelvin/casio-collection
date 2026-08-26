/**
 * §8.5's grid geometry, in a module of its own so that **one number is one
 * declaration**.
 *
 * It used to live in `WatchGrid`, which was right until `WatchGrid` needed
 * `SkeletonGrid` — the reveal sentinel now stands a skeleton where the next rows
 * will be. `SkeletonGrid` already imported these constants *from* `WatchGrid`
 * deliberately, so that a card and the skeleton that reserves its space cannot
 * drift apart; importing the component back would have closed that into a cycle,
 * and an ESM cycle here fails at module-init with a span of `undefined` rather
 * than at build, which is a layout collapsing with nothing in the log.
 *
 * `WatchGrid` re-exports both, so every existing import site is unchanged.
 *
 * The spans are §8.2's table read into AntD's 24 columns: 12 → 2 up, 8 → 3 up,
 * 6 → 4 up, 4 → 6 up. `md` is 768 and `xl` is 1200, which are the two numbers
 * §8.2 actually names, so the breakpoints are the specification rather than an
 * approximation of it.
 */
export const GRID_SPANS = { xs: 12, md: 8, lg: 6, xl: 4 } as const
export const GRID_GUTTER: [number, number] = [16, 16]
