# Free Stuff

Contactless sightings of free items nearby: a fresh camera photo, capture time,
GPS location and optional note. No public profile, contact fields, messages,
reservations or negotiations. The original Firewood URL remains valid.

App: https://firewood.freeappstore.online

`pnpm install && pnpm dev`; checks: `pnpm build`, `pnpm typecheck`, `pnpm test`,
`pnpm test:browser` (build first; requires Playwright Chromium), `fas check`.
Push directly to main to deploy.

The camera uses `getUserMedia`, asks for a fresh GPS fix at capture, records
capture time separately from server-created posting time, and shows GPS accuracy.
Gallery imports and manual pins are unavailable for new sightings. Device-supplied
time/location are not certified proof. Dictated text notes are optional on browsers
supporting speech recognition; no audio is stored.

Uses FAS public-read `listings` and `fas.photos`: 640 px, 200 KB maximum, explicit
public photo uploads and 90-day storage retention. New sightings expire after
48 hours and are hidden from discovery. Legacy Firewood posts remain compatible;
their upload time is labelled Posted, never Photo taken. Owners can mark a sighting
gone or remove it, deleting the photo. Text metadata remains under collection quotas.

For paid items and private seller conversations, use
https://classifieds.proappstore.online.
