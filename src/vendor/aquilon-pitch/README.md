# VENDORED — do not edit anything in this directory

A copy of `src/lib/` from [aquilon-pitch](https://github.com/stoatworks-labs/aquilon-pitch),
the LivePremier pitch-compensation engine. Same reasoning as every other copy in
the fleet: one implementation, copied rather than re-derived, so two tools cannot
reach different conclusions about the same device.

It carries four things that are easy to get backwards and still look right, each
established upstream by driving a LivePremier simulator rather than reading the
manual:

- the ratio **multiplies** a group's raster to give its canvas footprint, so a
  **coarser** wall takes a ratio **above** 1.000
- the field is an integer in thousandths, range 0.100 to 10.000
- an out-of-range write is **discarded** by the device, not clamped
- the footprint **floors**, so 1080 × 1.234 is 1332 and not 1333

Upstream commit `8d8eed64adb1e5067edbda181dbc284d2a203aa4`, synced 2026-08-27 — 6 files.

This repo is TypeScript, so it takes the sources and keeps the types;
livepremier-plus is plain JavaScript and vendors aquilon-pitch's bundled
`dist-lib/` build instead.

`npm run sync:pitch-engine` re-copies it and rewrites `MANIFEST.json`;
`src/lib/__tests__/vendor.test.ts` fails when the copy has drifted from an
upstream checkout, and skips when there is not one to compare with.

Edits belong upstream, in aquilon-pitch's `src/lib/`.
