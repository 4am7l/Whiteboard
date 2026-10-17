# Whiteboard

React + Excalidraw whiteboard, prepared for Cloudflare Pages.

## Development

```bash
npm install
npm run dev
```

## Cloudflare Pages

- Build command: `npm run build`
- Output directory: `dist`

Shared drawings are persisted in Cloudflare D1; media is stored in R2.

## Persistence and performance

The app now uses D1 (`DB`) for the shared scene and R2 (`STICKERS`) for images,
voice notes and sticker previews. Configure `BOARD_PIN` (six digits) and
`SESSION_SECRET`; search additionally uses `GIPHY_API_KEY` and `YOUTUBE_API_KEY`.
Run `schema.sql` once for a new D1 database. Existing installations get the
additive revision tables/index/triggers automatically on the first board request;
existing elements are preserved. No destructive migration is required.

- Initial scene load is followed by indexed revision deltas. Deleted elements
  remain as tombstones so offline clients cannot resurrect them. No automatic
  tombstone purge is performed without a safe client-acknowledgement policy.
- Writes are batched. Acknowledgements include exact version/nonces; conflicts
  retain a local recovery copy and provide an explicit restore action.
- IndexedDB retains pending edits and image uploads across reloads. Scene edits
  are coalesced over 100 ms and committed before upload. Storage quota/private
  browsing errors are shown; local recovery is not a substitute for backups.
- The first scene must load successfully before editing is enabled. A fully
  offline initial launch is not supported; unsent edits remain in local storage.
- Incoming collaboration updates continue while outgoing edits are pending.
  Hidden tabs pause scene polling; network errors use bounded backoff.
- Camera movement uses a single transform per media layer; card contents are
  memoized. Offscreen media is culled, except active playback. YouTube players
  initialize on demand and playback timers run only while playing.
- Images download separately from scene application with three concurrent reads.
  Original images accept up to 30 MiB; upload concurrency is two. Sticker grids
  paginate and use small previews, including on-demand previews for old files.
- Light performance mode disables expensive media blur; normal mode temporarily
  disables blur during gestures. Existing drawing/locking/resize controls remain.

## Validation

`npm ci`, `npm run build`, and `npm test` (Node 22.13+ for the SQLite test adapter).
Tests exercise revision migration, deltas, deletions, competing edits, idempotent
retries, pending-edit merge protection and rotated viewport bounds.

A real Cloudflare deployment and physical iPad playback/FPS still require device
validation. Browser autoplay policies may require a second tap after YouTube loads.
