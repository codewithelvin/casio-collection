import type { MouseEvent } from 'react'
import { App, Button, Tooltip } from 'antd'
import CheckOutlined from '@ant-design/icons/CheckOutlined'
import HeartOutlined from '@ant-design/icons/HeartOutlined'
import HeartFilled from '@ant-design/icons/HeartFilled'
import type { BrowseModel } from '../catalog/schema.ts'
import { needsRemovalConfirmation, useOwnership } from '../collection/mutations.ts'
import { useSessionStore } from '../auth/session.ts'
import { t } from '../i18n/strings'

/**
 * §8.7 / FR-4 — **the button this whole product is about**, and the wishlist
 * heart beside it.
 *
 * Both controls act on one row (D8), so they share one mutation and one pending
 * state. That is FR-4.6 read precisely: *its own* mutation is the watch's, not
 * the control's — pressing Owned while a wishlist write is in flight would be
 * two statements racing for the same primary key.
 *
 * Everything about *what* a press means is in `collection/mutations.ts`. What is
 * here is what it looks like, which is the half that has to survive being
 * pressed on a 360 px screen by somebody standing in a shop.
 */
export function OwnershipControls({
  model,
  size = 'middle',
}: {
  model: BrowseModel
  size?: 'small' | 'middle' | 'large'
}) {
  const { message, notification, modal } = App.useApp()
  const sessionStatus = useSessionStore((state) => state.status)

  const ownership = useOwnership(model, {
    onMoved: () => {
      void message.success(`${model.ref} · ${t('owned.moved')}`)
    },
    onFailure: (retry) => {
      // A notification rather than a message, because FR-4.3 asks for a retry
      // and a toast that vanishes after three seconds cannot carry a button
      // anyone will reach. Keyed by model so marking five watches on a dead
      // connection stacks five failures rather than replacing one five times.
      const key = `collection-${model.id}`
      notification.error({
        key,
        message: t('owned.failed.title'),
        description: t('owned.failed.body'),
        duration: 0,
        btn: (
          <Button
            size="small"
            type="primary"
            onClick={() => {
              notification.destroy(key)
              retry()
            }}
          >
            {t('owned.retry')}
          </Button>
        ),
      })
    },
  })

  /**
   * §14.2 — no Supabase project, so there is nothing to sign into and nothing
   * to write. The control renders **nothing at all**, which is the same rule
   * the header's account menu follows and the same sentence this file's
   * placeholder in WatchCard carried from M2: a primary action that cannot work
   * is worse than no action. It is not a degraded state, it is the state the
   * site is in until the client finishes M4's console steps.
   */
  if (sessionStatus === 'unavailable') return null

  const owned = ownership.status === 'owned'
  const wishlisted = ownership.status === 'wishlist'

  /**
   * FR-11.5 — offline, disabled **with a visible explanation**. The tooltip is
   * the explanation: a control that is simply grey is a control the reader
   * assumes is broken, and D33's rule is worth stating rather than implying.
   */
  const disabled = ownership.pending || ownership.offline

  /**
   * The card wraps itself in a stretched link (§8.6). These controls sit above
   * it in the stacking order, so a press lands here — but a press that bubbles
   * would still be a navigation on the way up. Stopping it is what keeps
   * *marking a watch* from also *opening* it.
   */
  const swallow = (event: MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
  }

  const onOwned = (event: MouseEvent) => {
    swallow(event)
    if (!owned) return ownership.set('owned')

    // FR-4.4 — asked once, and only when there is something to lose.
    if (!needsRemovalConfirmation(ownership.item)) return ownership.clear()
    modal.confirm({
      title: t('owned.removeNote.title'),
      content: t('owned.removeNote.body'),
      okText: t('owned.removeNote.confirm'),
      okButtonProps: { danger: true },
      cancelText: t('owned.removeNote.cancel'),
      onOk: () => ownership.clear(),
    })
  }

  const onWishlist = (event: MouseEvent) => {
    swallow(event)
    // A wishlisted watch pressed again comes off the list. An owned one pressed
    // here moves back to the wishlist, which is FR-4.5 in the other direction
    // and needs no confirmation — nothing is destroyed by a move.
    if (wishlisted) return ownership.clear()
    ownership.set('wishlist')
  }

  const row = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <Button
        size={size}
        /**
         * **The name is fixed to the label, and the loading state must not
         * change it.**
         *
         * AntD's `loading` injects a spinner that is another `role="img"` with
         * an aria-label of its own, so mid-write this button would announce
         * itself as "loading Owned" and stop answering to "Owned" — which
         * breaks voice control at the exact moment somebody is waiting to hear
         * that their press worked. §8.7 already asks for no visible change of
         * shape; this is the same requirement for the name. `aria-busy` is what
         * carries the state, which is what it is for.
         */
        aria-label={owned ? t('owned.marked') : t('owned.mark')}
        aria-busy={ownership.pending}
        // §8.7 — solid fill and a check when marked, outline when not.
        type={owned ? 'primary' : 'default'}
        // Wrapped so it is decoration. Every AntD icon renders as `role="img"`
        // with an aria-label of its own name, so a bare one here would make the
        // button announce "check Owned" — the same fault the watch page's
        // `Glyph` exists for, arriving on the one control that matters most.
        icon={owned ? <span aria-hidden="true"><CheckOutlined /></span> : undefined}
        loading={ownership.pending}
        disabled={disabled}
        onClick={onOwned}
        // **`flex: 1` is what makes §8.7's "no size change, no layout shift"
        // true.** The label changes length between states and `loading` adds a
        // spinner where an unmarked button has no icon, so a button sized by
        // its content would resize under the cursor mid-press. Sized by its
        // row, it cannot.
        //
        // **Unmarked, it wears the accent rather than the default grey.** §8.7
        // asks for "outline when not", and this is still an outline — what
        // changes is that the outline is Casio blue instead of the neutral
        // border every secondary control on the page already uses. This is the
        // one action the whole product exists for (the product in one line:
        // press *Owned One*), and rendering it in the same grey as a filter
        // reset said the opposite. The marked state keeps its solid fill, so
        // the two are still told apart by fill and by the check, not by hue
        // alone — which matters for anyone who cannot use the hue.
        //
        // **`--cc-primary`, and the property name is the whole bug this fixes.**
        // It read `var(--cc-accent, #0033a0)`, and `--cc-accent` is defined
        // nowhere — `vite.config.ts` injects the kebab-cased keys of
        // `SHELL_TOKENS`, which gives `--cc-primary`, `--cc-bg-container` and so
        // on, and never an `--cc-accent`. So the fallback was not a fallback; it
        // was the value, at every width and in **both** themes. On the dark
        // ground that is #0033a0 on #141414 — about 1.6:1, which is the ratio
        // `palette.ts` names as the reason `CASIO_BLUE_DARK` exists at all. The
        // one control this product is about was unreadable at night.
        //
        // `--cc-primary` is the theme-selected value (#0033a0 light, #4487dc
        // dark) and it is the same string the AntD-rendered primary button beside
        // it is painted with, so the marked and unmarked states are one colour
        // rather than two that nearly match. No fallback: a missing custom
        // property should show as an unstyled border, not as a hardcoded one that
        // hides the mistake for another milestone.
        style={{
          flex: 1,
          minWidth: 0,
          ...(owned ? {} : { borderColor: 'var(--cc-primary)', color: 'var(--cc-primary)' }),
        }}
      >
        {owned ? t('owned.marked') : t('owned.mark')}
      </Button>

      {/* §8.7 — "a Button type="text", filled when set". Secondary in weight
          because FR-4.5 makes it secondary in meaning: the site is about what
          you own, and the wishlist is the answer to a different question. */}
      <Button
        size={size}
        type="text"
        aria-label={wishlisted ? t('wishlist.remove') : t('wishlist.add')}
        icon={wishlisted ? <HeartFilled /> : <HeartOutlined />}
        disabled={disabled}
        onClick={onWishlist}
        style={{ flexShrink: 0 }}
      />
    </div>
  )

  // FR-11.7 asks for the offline state to be said once, calmly, in the header —
  // so this is not a second announcement. It is the reason THIS control is
  // disabled, available where somebody just tried to press it.
  return ownership.offline ? <Tooltip title={t('offline.cannotChange')}>{row}</Tooltip> : row
}
