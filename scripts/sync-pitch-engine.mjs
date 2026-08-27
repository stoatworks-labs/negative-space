/*
 * Re-copy the pitch-compensation engine from an aquilon-pitch checkout.
 *
 * Negative Space already works out what one canvas pixel is worth in
 * millimetres and how many of them each surface takes. Turning that into the
 * two numbers a LivePremier wants is a short step, and it is a short step with
 * four traps in it — the direction of the ratio, a 0.100–10.000 range, a field
 * that holds three decimals, and a device that FLOORS the footprint rather than
 * rounding it. aquilon-pitch established all four by driving a simulator and
 * pins them as tests. Re-deriving them here would eventually disagree with it,
 * and both tools would look right.
 *
 *   npm run sync:pitch-engine                  looks in ../aquilon-pitch
 *   npm run sync:pitch-engine -- /path/to/repo
 *
 * This repo is TypeScript, so it takes aquilon-pitch's `src/lib/` SOURCES and
 * keeps the types — where livepremier-plus, which is plain JavaScript, vendors
 * that repo's bundled `dist-lib/` build instead. Same engine, two shapes, and a
 * hash check on each. `src/lib/` upstream is closed on purpose so this copy
 * compiles with nothing left behind.
 *
 * Tests are deliberately not copied: they are aquilon-pitch's own suite and
 * belong to its checkout, not to this one.
 */

import { readFile, writeFile, mkdir, rm, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const destDir = join(here, '..', 'src', 'vendor', 'aquilon-pitch');
const upstreamRepo = resolve(process.argv[2] || join(here, '..', '..', 'aquilon-pitch'));
const upstreamDir = join(upstreamRepo, 'src', 'lib');

/** Everything except the upstream repo's own test suite. */
async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === '__tests__') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(full));
    else if (entry.name.endsWith('.ts')) out.push(full);
  }
  return out.sort();
}

let files;
try {
  files = await walk(upstreamDir);
} catch {
  console.error(`! no ${upstreamDir} — is aquilon-pitch checked out beside this repo?`);
  process.exit(1);
}

let commit = 'unknown';
let dirty = false;
try {
  commit = execFileSync('git', ['-C', upstreamRepo, 'log', '-1', '--format=%H', '--', 'src/lib'],
    { encoding: 'utf8' }).trim();
  dirty = execFileSync('git', ['-C', upstreamRepo, 'status', '--short', '--', 'src/lib'],
    { encoding: 'utf8' }).trim().length > 0;
} catch {
  console.warn('! upstream is not a git checkout; recording commit as unknown');
}

/* Syncing from a modified working copy records a commit that does not contain
   what was copied. Refuse rather than write a provenance line that lies. */
if (dirty) {
  console.error('! upstream src/lib/ has uncommitted changes — commit there first');
  process.exit(1);
}

await rm(destDir, { recursive: true, force: true });
await mkdir(destDir, { recursive: true });

const manifest = {
  upstream: 'stoatworks-labs/aquilon-pitch',
  path: 'src/lib',
  commit,
  synced: new Date().toISOString().slice(0, 10),
  files: {},
};

for (const file of files) {
  const rel = relative(upstreamDir, file);
  const body = await readFile(file);
  manifest.files[rel] = createHash('sha256').update(body).digest('hex');
  await writeFile(join(destDir, rel), body);
}

await writeFile(join(destDir, 'MANIFEST.json'), JSON.stringify(manifest, null, 2) + '\n');

await writeFile(join(destDir, 'README.md'), `# VENDORED — do not edit anything in this directory

A copy of \`src/lib/\` from [aquilon-pitch](https://github.com/stoatworks-labs/aquilon-pitch),
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

Upstream commit \`${commit}\`, synced ${manifest.synced} — ${files.length} files.

This repo is TypeScript, so it takes the sources and keeps the types;
livepremier-plus is plain JavaScript and vendors aquilon-pitch's bundled
\`dist-lib/\` build instead.

\`npm run sync:pitch-engine\` re-copies it and rewrites \`MANIFEST.json\`;
\`src/lib/__tests__/vendor.test.ts\` fails when the copy has drifted from an
upstream checkout, and skips when there is not one to compare with.

Edits belong upstream, in aquilon-pitch's \`src/lib/\`.
`);

console.log(`synced ${files.length} files from ${upstreamDir}`);
console.log(`  commit ${commit}`);
