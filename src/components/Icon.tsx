const paths = {
  house: 'M3 10 12 3l9 7M5 9v12h14V9M9 21v-8h6v8',
  grid: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  receipt: 'M6 3h12v18l-3-2-3 2-3-2-3 2V3ZM9 7h6M9 11h6M9 15h3',
  box: 'm3 7 9-4 9 4v10l-9 4-9-4V7Zm0 0 9 4 9-4M12 11v10M7 5l10 4',
  bag: 'M5 7h14l2 14H3L5 7ZM9 9V6a3 3 0 0 1 6 0v3',
  leaf: 'M20 3C9 2 3 7 5 15c2 6 12 5 15-12ZM4 21l11-12',
  plus: 'M12 5v14M5 12h14',
  calendar: 'M4 5h16v16H4zM8 3v4M16 3v4M4 10h16M8 14h2M14 14h2',
  paperclip: 'm8 12 6-6a3 3 0 0 1 4 4l-8 8a5 5 0 0 1-7-7l8-8M7 13l6-6',
  arrow: 'M5 12h14m-5-5 5 5-5 5',
  info: 'M12 11v6M12 7h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  close: 'm6 6 12 12M6 18 18 6',
  upload: 'M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5',
  check: 'm5 12 4 4L19 6',
  camera: 'M3 7h4l2-3h6l2 3h4v14H3V7ZM16 13a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
} as const
export function Icon({ name }: { name: keyof typeof paths }) {
  return <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>
}
