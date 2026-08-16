import { Placeholder } from '../../ui/Placeholder'

/**
 * M4: the OAuth and magic-link return (§9.2, §9.4).
 * This is where the pending intent is read, applied, cleared and confirmed —
 * the one concession D6 makes to a guest who pressed the button before signing
 * in. Single slot, not a queue.
 */
export default function AuthCallbackRoute() {
  return <Placeholder titleKey="route.authCallback.title" />
}
