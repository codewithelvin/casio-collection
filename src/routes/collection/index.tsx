import { Placeholder } from '../../ui/Placeholder'

/**
 * M6: Owned and Wishlist tabs (§3.6).
 * Auth-required from M4 — and §7.3 is specific that a missing session renders
 * the sign-in modal over a blurred shell rather than redirecting, so the URL
 * survives and the user lands where they meant to.
 */
export default function CollectionRoute() {
  return <Placeholder titleKey="route.collection.title" />
}
