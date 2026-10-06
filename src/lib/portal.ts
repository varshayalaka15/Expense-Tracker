export type Portal = 'upload' | 'admin'
export function currentPortal(search: string): Portal {
  return new URLSearchParams(search).get('view') === 'admin' ? 'admin' : 'upload'
}
export function portalLink(base: string, portal: Portal): string {
  // Never copy auth tokens or other query parameters into a shareable link.
  return `${base}?view=${portal}`
}
