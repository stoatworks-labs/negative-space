/**
 * Where the project lives between visits.
 *
 * `localStorage` is the working copy; the URL hash is the shareable one. The
 * hash wins on load, because a link someone was sent is a deliberate act and
 * whatever was left in the tab is not.
 *
 * Nothing is uploaded. There is no backend to upload it to, which is the point:
 * a wall layout is a client's set design and it has nowhere to leak to.
 */

import type { Project } from './types.ts'

const KEY = 'aquilon-pitch:project'

export const DEFAULT_PROJECT: Project = {
  name: 'Untitled screen',
  arrangement: 'row',
  referenceId: '',
  groups: [
    {
      id: 'a', name: 'Main wall', outputKey: '1',
      pxWidth: 3840, pxHeight: 2160,
      entry: { mode: 'pitch', hMm: 2.6, vMm: 2.6 },
    },
    {
      id: 'b', name: 'Side wall', outputKey: '2',
      pxWidth: 1920, pxHeight: 1080,
      entry: { mode: 'pitch', hMm: 5.2, vMm: 5.2 },
    },
  ],
}

export function load(): Project {
  return fromHash() ?? fromStorage() ?? structuredClone(DEFAULT_PROJECT)
}

export function save(project: Project): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(project))
  } catch {
    // Private windows, full quotas, and browsers set to block site data all
    // throw here. Losing the working copy is not worth losing the session over.
  }
}

/** A link that carries the whole project — no shortener, no server, no expiry. */
export function shareLink(project: Project): string {
  const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(project))))
  return `${location.origin}${location.pathname}#p=${encoded}`
}

function fromHash(): Project | null {
  const m = /[#&]p=([^&]+)/.exec(location.hash)
  if (!m) return null
  try {
    return validate(JSON.parse(decodeURIComponent(escape(atob(m[1])))))
  } catch {
    return null
  }
}

function fromStorage(): Project | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? validate(JSON.parse(raw)) : null
  } catch {
    return null
  }
}

/**
 * Enough shape-checking to keep a hand-edited hash from crashing the app.
 *
 * Not a schema validator: the engine already treats unusable numbers as absent,
 * so the only thing that must hold here is that the collections are collections
 * and every group has an id to key a list by.
 */
function validate(v: unknown): Project | null {
  if (!v || typeof v !== 'object') return null
  const p = v as Partial<Project>
  if (!Array.isArray(p.groups)) return null
  if (!p.groups.every((g) => g && typeof g === 'object' && typeof g.id === 'string' && g.id)) {
    return null
  }
  return {
    name: typeof p.name === 'string' ? p.name : 'Untitled screen',
    arrangement: p.arrangement === 'column' ? 'column' : 'row',
    referenceId: typeof p.referenceId === 'string' ? p.referenceId : '',
    groups: p.groups,
  }
}
