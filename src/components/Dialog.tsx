import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { Icon } from './Icon'

export function Dialog({ title, children, onClose, className = '' }: { title: string; children: ReactNode; onClose: () => void; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null)
  const opener = useRef(document.activeElement as HTMLElement | null)
  useEffect(() => {
    const dialog = ref.current!
    const previous = opener.current
    dialog.showModal()
    return () => { dialog.close(); previous?.focus() }
  }, [])
  return <dialog ref={ref} className={`dialog ${className}`} aria-labelledby="dialog-title" onCancel={event => { event.preventDefault(); onClose() }}>
    <header className="dialog-header"><div><p className="dialog-kicker">Our household</p><h2 id="dialog-title">{title}</h2></div><button className="icon-button" type="button" onClick={onClose} aria-label="Close dialog"><Icon name="close" /></button></header>
    {children}
  </dialog>
}
