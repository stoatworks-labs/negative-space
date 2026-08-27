/**
 * A minimal, dependency-free ZIP writer — enough to build an OOXML package.
 *
 * Entries are STORED (compression method 0), never deflated. A .pptx is a few
 * kilobytes of XML; compressing it would mean shipping a deflate implementation
 * or pulling a dependency, to save nothing anyone will notice. Stored entries
 * are fully legal ZIP and PowerPoint opens them without comment.
 *
 * The one thing that must be exactly right is the central directory: every
 * entry's local-header offset is a BYTE offset into the finished file. Building
 * the archive as a string and encoding at the end would shift every offset by
 * the extra width of any non-ASCII byte, and the result is a file some readers
 * silently repair and others reject — so this assembles Uint8Arrays throughout
 * and never touches a string after encoding.
 */

const encoder = new TextEncoder()

/** CRC-32 (IEEE 802.3), which the ZIP central directory requires per entry. */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[i] = c >>> 0
  }
  return t
})()

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

export type ZipEntry = { path: string; data: Uint8Array }

export function zipEntry(path: string, text: string): ZipEntry {
  return { path, data: encoder.encode(text) }
}

function u16(v: number): number[] {
  return [v & 0xff, (v >>> 8) & 0xff]
}
function u32(v: number): number[] {
  return [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff]
}

/**
 * Build the archive.
 *
 * Timestamps are fixed rather than `new Date()`: a byte-identical package for
 * identical input is what lets a test assert on the output at all, and nothing
 * downstream reads the mtime of a slide.
 */
export function buildZip(entries: ZipEntry[]): Uint8Array {
  const DOS_TIME = 0 // 00:00:00
  const DOS_DATE = (2026 - 1980) << 9 | (1 << 5) | 1 // 2026-01-01

  const chunks: Uint8Array[] = []
  const central: number[] = []
  let offset = 0

  for (const e of entries) {
    const name = encoder.encode(e.path)
    const crc = crc32(e.data)
    const local = [
      ...u32(0x04034b50),
      ...u16(20), // version needed
      ...u16(0), // flags
      ...u16(0), // stored
      ...u16(DOS_TIME),
      ...u16(DOS_DATE),
      ...u32(crc),
      ...u32(e.data.length),
      ...u32(e.data.length),
      ...u16(name.length),
      ...u16(0),
    ]
    const header = new Uint8Array(local.length + name.length)
    header.set(local, 0)
    header.set(name, local.length)
    chunks.push(header, e.data)

    central.push(
      ...u32(0x02014b50),
      ...u16(20), // version made by
      ...u16(20), // version needed
      ...u16(0),
      ...u16(0),
      ...u16(DOS_TIME),
      ...u16(DOS_DATE),
      ...u32(crc),
      ...u32(e.data.length),
      ...u32(e.data.length),
      ...u16(name.length),
      ...u16(0), // extra
      ...u16(0), // comment
      ...u16(0), // disk
      ...u16(0), // internal attrs
      ...u32(0), // external attrs
      ...u32(offset),
      ...name,
    )
    offset += header.length + e.data.length
  }

  const centralBytes = new Uint8Array(central)
  const end = new Uint8Array([
    ...u32(0x06054b50),
    ...u16(0),
    ...u16(0),
    ...u16(entries.length),
    ...u16(entries.length),
    ...u32(centralBytes.length),
    ...u32(offset),
    ...u16(0),
  ])

  const total = offset + centralBytes.length + end.length
  const out = new Uint8Array(total)
  let p = 0
  for (const c of chunks) {
    out.set(c, p)
    p += c.length
  }
  out.set(centralBytes, p)
  p += centralBytes.length
  out.set(end, p)
  return out
}
