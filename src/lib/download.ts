/**
 * Hand a generated file to the browser.
 *
 * Everything this tool produces is made in the page and never leaves it — the
 * CSP has `connect-src 'self'` precisely so that is enforced rather than
 * promised. A blob URL is the whole delivery mechanism.
 *
 * The revoke is deferred rather than immediate: revoking in the same tick as
 * the click races the browser's own fetch of the blob in some engines, and the
 * download silently produces a zero-byte file.
 */
export function download(data: Blob | string, filename: string, type = 'text/plain'): void {
  const blob = typeof data === 'string' ? new Blob([data], { type: `${type};charset=utf-8` }) : data
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** A filename stem safe on every platform, from a user-typed project name. */
export function slug(name: string): string {
  const s = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return s || 'negative-space'
}
