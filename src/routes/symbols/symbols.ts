/**
 * The display-indicator glossary: what the little words on a Casio digital
 * display mean.
 *
 * **Why this is a data module and not `i18n/strings.ts`.** D12 says every
 * user-facing string goes through `t()`, and this file is a deliberate,
 * measured exception rather than a lapse. `strings.ts` is imported by
 * `AppShell`, which is in the entry graph — so a string added there is
 * downloaded by every visitor on every URL on this site. This glossary is three
 * dozen entries of two or three sentences each; put in `strings.ts` it would
 * ship the whole thing to somebody who only ever opens a watch page, which is
 * exactly the cost §12 spent a milestone removing. Here it is imported by one
 * lazily loaded route and lands in that route's chunk. The page's *chrome* — its
 * heading, its lead, its section labels — does go through `t()`, because that is
 * what D12 is about.
 *
 * **Every entry cites the manual that defines it, and that is the point.** This
 * is the same promise §10.6 makes about a model: the catalogue reports what a
 * page says, and a claim nobody can check is decoration. `modules` holds the
 * Casio module numbers whose Operation Guide defines the indicator, and
 * `manualUrl` turns one into the PDF on casio.com. Those are the same manuals
 * `catalog-src` already cites for specifications, so this page rests on sources
 * the repository had already accepted rather than on a new class of them.
 *
 * **What this page does NOT claim.** It is not "every symbol Casio has ever
 * printed on an LCD" — nobody can source that, and D25 is that the catalogue
 * reports what a page says and nothing adjacent to it. It is every indicator
 * defined by the twenty module manuals this catalogue cites, which is a bounded
 * claim a reader can verify. `SOURCED_MODULES` is that list, and the page says
 * so in its own words.
 */

/** The Casio module numbers whose Operation Guides this glossary is read from. */
export const SOURCED_MODULES = [
  '3159',
  '3184',
  '3229',
  '3230',
  '3246',
  '3252',
  '3266',
  '3445',
  '3489',
  '3490',
  '3499',
  '5146',
  '5345',
  '5359',
  '5425',
  '5463',
  '5476',
  '5611',
  '5653',
  '5661',
] as const

/**
 * Casio files a module's guide under the first two digits of its number —
 * `.../pdf/32/3266/qw3266_EN.pdf`. Built here rather than written out once per
 * citation, so a citation cannot be a typo pointing at somebody else's watch.
 */
export const manualUrl = (module: string) =>
  `https://www.casio.com/content/dam/casio/global/support/manuals/watches/pdf/${module.slice(0, 2)}/${module}/qw${module}_EN.pdf`

/**
 * The indicators that are drawings rather than words. A schematic, not a
 * facsimile: Casio's glyphs are their artwork, and what a reader needs is to
 * recognise the *kind* of thing — a bell, an aerial, an arrow — beside the
 * sentence that says what it means. `null` on a symbol that is simply text.
 */
export type SymbolIcon =
  | 'bell'
  | 'repeat'
  | 'aerial'
  | 'aerial-receiving'
  | 'lamp'
  | 'lamp-auto'
  | 'arrow-up'
  | 'arrow-down'
  | 'arrow-up-turn'
  | 'arrow-down-turn'
  | 'moon'
  | 'tide'
  | 'hands'

export interface WatchSymbol {
  id: string
  /** What is actually printed on the display, where the indicator is a word. */
  token?: string
  /** A drawing, where it is not. */
  icon?: SymbolIcon
  /** Casio's own name for it, as the Operation Guide writes it. */
  name: string
  /** What it tells you. */
  meaning: string
  /** The part worth knowing that the one-liner leaves out. Optional. */
  detail?: string
  /** Module numbers whose Operation Guide defines this indicator. */
  modules: string[]
}

/**
 * A literal union rather than `string`, so `t(`symbols.group.${id}`)` in the
 * page type-checks against `StringKey` instead of widening to `string`. It also
 * means a group added here without its heading in `strings.ts` fails the build
 * rather than rendering the key.
 */
export type SymbolGroupId =
  | 'time'
  | 'alarm'
  | 'timing'
  | 'power'
  | 'radio'
  | 'light'
  | 'sensor'
  | 'sea'
  | 'other'

export interface SymbolGroup {
  id: SymbolGroupId
  symbols: WatchSymbol[]
}

/**
 * ORDER IS EDITORIAL, and it is the order a person meets these things in: the
 * time first, then the alarm they set, then the functions, then the housekeeping
 * — power, radio, light — and the sensors last, because most watches have none.
 */
export const SYMBOL_GROUPS: SymbolGroup[] = [
  {
    id: 'time',
    symbols: [
      {
        id: 'pm',
        token: 'P',
        name: 'PM indicator',
        meaning:
          'The time on the display is afternoon or evening. With the 12-hour format it appears for times from noon to 11:59 p.m.',
        detail:
          'It cannot appear at all on the 24-hour format, where times run 0:00 to 23:59 without any indicator. A display with no P before noon is normal — many modules mark only the afternoon.',
        modules: ['3159', '3229', '3252', '3266', '5146', '5611'],
      },
      {
        id: 'am',
        token: 'A',
        name: 'AM indicator',
        meaning:
          'The time is morning — midnight to 11:59 a.m. Modules that show one use it as the counterpart of P, and it matters most when setting an alarm.',
        detail:
          'Casio warns about this exact confusion when setting an alarm time: with the 12-hour format, take care to set the time correctly as a.m. (A indicator) or p.m. (P indicator).',
        modules: ['3252'],
      },
      {
        id: 'format',
        token: '24H',
        name: '12-hour / 24-hour format',
        meaning:
          'Which clock the watch is counting on. The format chosen in the Timekeeping Mode is applied in every other mode.',
        modules: ['5611'],
      },
      {
        id: 'dst',
        token: 'DST',
        name: 'DST indicator',
        meaning:
          'Daylight Saving Time is on for the city being shown, which advances the time by one hour from standard time.',
        detail:
          'It is per city, not per watch. A World Time city reading an hour out is almost always this setting rather than a fault — Casio lists it first among the things to check.',
        modules: ['3159', '3246', '3266', '3490', '5463', '5611'],
      },
    ],
  },

  {
    id: 'alarm',
    symbols: [
      {
        id: 'alarm-on',
        icon: 'bell',
        name: 'Alarm on indicator',
        meaning:
          'At least one daily alarm is switched on. It stays on the display in every mode, so the watch can tell you it will go off without being asked.',
        modules: ['3159', '3229', '3246', '3266', '3490', '5146', '5463', '5611'],
      },
      {
        id: 'alarm-number',
        token: 'AL1',
        name: 'Alarm number',
        meaning:
          'Which of the alarms is on screen. Modules with five alarms number them AL1 to AL5 — commonly four one-time alarms and one snooze alarm.',
        modules: ['3159', '3184', '3246', '3266', '5146', '5463', '5476', '5611'],
      },
      {
        id: 'snooze',
        token: 'SNZ',
        name: 'Snooze alarm',
        meaning:
          'The alarm on this screen repeats after it is silenced, rather than sounding once and stopping.',
        detail: 'One of the alarms is the snooze alarm; the rest are one-time alarms.',
        modules: ['3159', '3184', '3266', '3445', '3490', '3499', '5146', '5476'],
      },
      {
        id: 'signal',
        token: 'SIG',
        name: 'Hourly Time Signal on indicator',
        meaning: 'The watch beeps on the hour, every hour.',
        detail:
          'It is set on the same screens as the alarms — on many modules the Hourly Time Signal is the screen after the last alarm, shown as :00.',
        modules: ['3159', '3229', '3246', '3266', '3499', '5146', '5476', '5611'],
      },
      {
        id: 'mute',
        token: 'MUTE',
        name: 'Mute indicator',
        meaning:
          'The button operation tone is off — pressing buttons makes no sound. Its counterpart on the same screen is KEY, which is the tone switched on.',
        detail:
          'It is the button tone the setting names, and the setting is reached from the Timekeeping Mode rather than from any alarm screen.',
        modules: ['3246', '3445', '3490', '3499', '5463', '5476', '5611'],
      },
    ],
  },

  {
    id: 'timing',
    symbols: [
      {
        id: 'spl',
        token: 'SPL',
        name: 'Split indicator',
        meaning:
          'The stopwatch is set to split times, or a split is frozen on the display. A split reading shows the time elapsed since the stopwatch was started.',
        detail:
          'Flashing means a split is being held while the count continues underneath. Leaving the Stopwatch Mode with a split frozen clears it.',
        modules: ['3159', '3184', '3246', '3252', '3266', '5146', '5476', '5611'],
      },
      {
        id: 'lap',
        token: 'LAP',
        name: 'Lap indicator',
        meaning:
          'The stopwatch is set to lap times instead of splits. A lap reading shows the time elapsed since the last lap, not since the start.',
        detail: 'On modules that offer both, one button toggles LAP and SPL.',
        modules: ['5146', '5425'],
      },
      {
        id: 'auto-repeat',
        icon: 'repeat',
        name: 'Auto repeat on indicator',
        meaning:
          'The countdown timer restarts from the beginning as soon as it reaches zero, instead of stopping.',
        modules: ['3229', '3230', '3489'],
      },
      {
        id: 'days',
        token: 'DAYS',
        name: 'DAYS indicator',
        meaning:
          'The Day Counter — the number of days to or from a target date. It flashes on the display when the target date is reached.',
        modules: ['3252'],
      },
    ],
  },

  {
    id: 'power',
    symbols: [
      {
        id: 'battery-level',
        token: 'H M L',
        name: 'Battery power indicator',
        meaning:
          'How much charge is in the rechargeable battery of a solar watch. H is high, M medium, L low — and at the lowest level functions start switching themselves off.',
        detail:
          'All three flashing together is the warning that matters: it means the charge is very low. Casio treats "is H or M displayed?" as the first question in almost every troubleshooting table.',
        modules: ['3159', '3184', '3246', '3266', '3445', '3490', '3499', '5463'],
      },
      {
        id: 'chg',
        token: 'CHG',
        name: 'CHG (charge) indicator',
        meaning: 'The watch is charging, or needs to be. It flashes when the charge level is low.',
        detail:
          'All three battery indicators flashing with CHG flashing as well is the state where the watch wants light, not a service centre.',
        modules: ['3159', '3184', '3266', '3445', '3490', '3499'],
      },
      {
        id: 'recover',
        token: 'RECOVER',
        name: 'Recovery indicator',
        meaning:
          'The watch is in charge recovery mode. It has run its battery down far enough that most functions are suspended until it has taken on charge.',
        detail:
          'Nothing is broken and nothing is lost. Leave it in light; the indicator stops flashing when it has recovered.',
        modules: ['3159', '3184', '3246', '3266', '3445', '3490', '5463'],
      },
      {
        id: 'power-saving',
        token: 'PS',
        name: 'Power Saving indicator',
        meaning:
          'Power Saving is turned on, so the watch blanks its display when it is left in the dark to conserve charge.',
        detail:
          'It is on the display in all modes while Power Saving is on. A watch that looks dead in a drawer is usually doing this — after six or seven days in the dark it enters a deeper sleep, blank with PS no longer flashing.',
        modules: ['3159', '3184', '3246', '3266', '3445', '3490', '3499'],
      },
    ],
  },

  {
    id: 'radio',
    symbols: [
      {
        id: 'signal-level',
        icon: 'aerial',
        name: 'Signal level indicator',
        meaning:
          'How strong the time calibration signal is where the watch is sitting. Use it as the guide when finding a spot to leave the watch overnight.',
        modules: ['3445', '3490', '5463'],
      },
      {
        id: 'receiving',
        icon: 'aerial-receiving',
        name: 'Receiving indicator',
        meaning:
          'A reception is happening right now. Casio asks you not to move the watch or press anything until it finishes.',
        modules: ['3490', '5463'],
      },
      {
        id: 'get',
        token: 'GET',
        name: 'GET indicator',
        meaning:
          'The last reception succeeded. It appears with the date and time that reception happened.',
        modules: ['3159', '3184', '3445', '3490', '5463'],
      },
      {
        id: 'rcvd',
        token: 'RCVD',
        name: 'RCVD indicator',
        meaning:
          'A reception succeeded earlier today, even though the most recent attempt failed. The time on the wrist is still the signal time.',
        modules: ['3159'],
      },
      {
        id: 'err',
        token: 'ERR',
        name: 'ERR (error) indicator',
        meaning:
          'Something did not work — a reception that failed, a sensor reading that could not be taken, or a calibration that did not complete.',
        detail:
          'Dashes followed by ERR is the sensor form of it. ERR that keeps coming back after a calibration is the point at which Casio stops suggesting fixes and suggests a service centre.',
        modules: ['3159', '3229', '3246', '3266', '3445', '3490', '5146', '5611'],
      },
      {
        id: 'set',
        token: 'SET',
        name: 'SET indicator',
        meaning:
          'The watch is in a setting screen. It flashes while a setting is being held or changed, and disappears when the watch returns to normal display.',
        modules: ['5611'],
      },
    ],
  },

  {
    id: 'light',
    symbols: [
      {
        id: 'auto-light',
        icon: 'lamp-auto',
        name: 'Auto light switch on indicator',
        meaning:
          'The display lights itself when the watch is angled towards your face, without a button press.',
        detail:
          'Casio asks that it be switched off before riding a bicycle or anything else where a sudden light is a hazard, and notes it only operates where the available light is already below a certain level.',
        modules: ['3159', '3246', '3266', '3445', '3490', '5146', '5463'],
      },
      {
        id: 'backlight-on',
        icon: 'lamp',
        name: 'Backlight function on indicator',
        meaning:
          'The illumination is available. On an EL module the whole display glows rather than a bulb lighting one corner.',
        modules: ['3230'],
      },
      {
        id: 'flash-alert',
        icon: 'lamp',
        name: 'Flash Alert indicator',
        meaning:
          'Flash Alert is enabled: the backlight flashes with the alerts instead of leaving them to the beeper alone — the alarm you can see rather than hear.',
        detail: 'It is shown in all modes until Flash Alert is disabled.',
        modules: ['3229', '3489'],
      },
    ],
  },

  {
    id: 'sensor',
    symbols: [
      {
        id: 'alti',
        token: 'ALTI',
        name: 'Altimeter Mode',
        meaning: 'The watch is reading altitude from barometric pressure.',
        modules: ['3246', '3445', '3490', '3499', '5463'],
      },
      {
        id: 'baro-mode',
        token: 'BARO',
        name: 'BARO indicator',
        meaning:
          'Barometric pressure change indicator display is enabled: the watch takes a pressure reading every two minutes whatever mode it is in.',
        detail:
          'It has a cost, and Casio names it. While this is on, time calibration signal reception and Power Saving are disabled, and it turns itself off automatically 24 hours later or when the battery goes low.',
        modules: ['3246', '3445', '3490', '3499', '5463'],
      },
      {
        id: 'pressure-fall',
        icon: 'arrow-down',
        name: 'Sudden fall in pressure',
        meaning:
          'The barometric pressure change indicator, pointing down. Weather worsening is the usual reading of it.',
        modules: ['3490', '3499', '5463'],
      },
      {
        id: 'pressure-rise',
        icon: 'arrow-up',
        name: 'Sudden rise in pressure',
        meaning: 'The same indicator pointing up.',
        modules: ['3490', '3499', '5463'],
      },
      {
        id: 'pressure-rise-fall',
        icon: 'arrow-up-turn',
        name: 'Sustained rise, changing to a fall',
        meaning: 'Pressure had been climbing and has turned over.',
        modules: ['3490', '3499', '5463'],
      },
      {
        id: 'pressure-fall-rise',
        icon: 'arrow-down-turn',
        name: 'Sustained fall, changing to a rise',
        meaning: 'Pressure had been dropping and has turned back up.',
        detail:
          'None of the four appear if there has been no noteworthy change in barometric pressure. An empty indicator is not a broken sensor.',
        modules: ['3490', '3499', '5463'],
      },
      {
        id: 'temp',
        token: 'TEMP',
        name: 'Thermometer Mode',
        meaning: 'The watch is reading temperature.',
        detail:
          'On the wrist it reads body heat as much as air. Casio expects it off the wrist for a reading of the air.',
        modules: ['3246', '3445', '3490', '3499', '5463'],
      },
      {
        id: 'comp',
        token: 'COMP',
        name: 'COMP indicator',
        meaning: 'A digital compass reading is in progress.',
        modules: ['3246', '3445', '3490', '3499', '5463'],
      },
      {
        id: 'thousand',
        token: '1000',
        name: '1000 indicator',
        meaning:
          'On a speed-indicator model, the value has gone over 1000 — the hand alone cannot say so, and this points at the mark that can.',
        modules: ['5146', '5425'],
      },
    ],
  },

  {
    id: 'sea',
    symbols: [
      {
        id: 'tide',
        icon: 'tide',
        name: 'Tide Graph',
        meaning:
          'The current tide level, as one of the display formats the Timekeeping Mode can be switched to.',
        detail:
          'The graph works on an average tide: a period of 12 hours 25 minutes from one high tide to the next.',
        modules: ['3184', '3266', '3445'],
      },
      {
        id: 'moon',
        icon: 'moon',
        name: 'Moon phase indicator',
        meaning:
          'The age of the moon, drawn as the part you can see against the part you cannot.',
        detail:
          'It can be reversed for the southern hemisphere, where the moon is to the north and the lit side is the other one.',
        modules: ['3184', '3266', '3445'],
      },
    ],
  },

  {
    id: 'other',
    symbols: [
      {
        id: 'hands-shifted',
        icon: 'hands',
        name: 'Hands shifted indicator',
        meaning:
          'On an ana-digi watch, the hands have been moved out of the way so they do not cover the digital display.',
        detail:
          'It is a deliberate state, not a fault, and the hands go back on the next button press. A watch whose hands disagree with its digits is usually this.',
        modules: ['5611'],
      },
    ],
  },
]

/** Every symbol, flattened — what the page counts and what the tests count. */
export const ALL_SYMBOLS: WatchSymbol[] = SYMBOL_GROUPS.flatMap((group) => group.symbols)
