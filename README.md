# Firewood

Free firewood listings: a small photo, public pickup pin, nearby search and
owner-managed collection status. Built with the FreeAppStore SDK.

- App: https://firewood.freeappstore.online
- `pnpm install && pnpm dev`
- `pnpm build`, `pnpm typecheck`, `pnpm test`, `fas check`
- Browser journeys: `pnpm exec playwright install chromium && pnpm test:browser`
  (build first; the test starts its own preview and mocks the API locally)
- Deploy: push directly to `main`.

Uses the shared public-read `listings` collection (`fas db share listings`).
Posting and managing listings require sign-in. Each upload uses `fas.photos`:
640 px, 200 KB maximum, public opt-in and 90-day expiry. The listing uses the
photo's server-issued expiry and disappears from discovery when expired or
collected. Marking collected/removing a post deletes its photo immediately.
Listing metadata persists under the platform collection quota; expiry hides it
from discovery, and its owner can remove it from My posts.

Maps load only when requested or when posting. Tiles are provided by
OpenStreetMap; directions open Google Maps. No payments, ads or analytics SDKs.
