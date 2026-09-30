import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { Dialog } from '../../components/Dialog'
import { Icon } from '../../components/Icon'
import { categories, parseAmount, today, validateForm, validateReceipt } from './model'
import type { Category, ExpenseDraft, FormErrors, FormValues } from './model'

export function ExpenseForm({ onClose, onSave }: { onClose: () => void; onSave: (draft: ExpenseDraft, file: File) => void }) {
  const [currentDate] = useState(today)
  const [values, setValues] = useState<FormValues>(() => ({ date: today(), description: '', category: 'Groceries', amount: '', paidBy: '', notes: '' }))
  const [errors, setErrors] = useState<FormErrors>({})
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState('')
  const [ready, setReady] = useState(false)
  const [reading, setReading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const submitting = useRef(false)
  const formRef = useRef<HTMLFormElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const chooseRef = useRef<HTMLButtonElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (!file) return
    const url = URL.createObjectURL(file)
    let cancelled = false
    const image = new Image()
    image.onload = () => { if (!cancelled) { setPreview(url); setReady(true); setReading(false); setErrors(previous => ({ ...previous, receipt: undefined })) } }
    image.onerror = () => { if (!cancelled) { setReading(false); setReady(false); setErrors(previous => ({ ...previous, receipt: 'This photo cannot be read. Choose another JPEG, PNG, or WebP photo.' })) } }
    image.src = url
    return () => { cancelled = true; image.onload = null; image.onerror = null; URL.revokeObjectURL(url) }
  }, [file])
  function update(field: keyof FormValues, value: string) { setValues(previous => ({ ...previous, [field]: value })); setErrors(previous => ({ ...previous, [field]: undefined })) }
  function choose(event: ChangeEvent<HTMLInputElement>) {
    const chosen = event.target.files?.[0]
    event.target.value = ''
    if (!chosen) return
    const error = validateReceipt(chosen)
    if (error) { setErrors(previous => ({ ...previous, receipt: error })); return }
    setPreview(''); setReady(false); setReading(true); setFile(chosen)
    setErrors(previous => ({ ...previous, receipt: undefined }))
  }
  function remove() { setFile(null); setPreview(''); setReady(false); setReading(false); setErrors(previous => ({ ...previous, receipt: 'Attach a bill photo before saving.' })) }
  function submit(event: FormEvent) {
    event.preventDefault()
    if (submitting.current) return
    const nextErrors = validateForm(values, ready && !!file, currentDate)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) {
      const first = Object.keys(nextErrors)[0]
      if (first === 'receipt') chooseRef.current?.focus()
      else formRef.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus()
      return
    }
    submitting.current = true; setSaving(true); setSaveError('')
    try { onSave({ date: values.date, description: values.description.trim(), category: values.category as Category, amountCents: parseAmount(values.amount.trim())!, paidBy: values.paidBy.trim(), notes: values.notes.trim() }, file!) }
    catch { submitting.current = false; setSaving(false); setSaveError('The expense could not be added. Your entries are still here. Try again.') }
  }
  const errorFor = (field: keyof FormErrors) => errors[field] ? <span className="field-error" id={`error-${field}`}>{errors[field]}</span> : null
  return <Dialog title="Add an expense" onClose={onClose} className="expense-dialog">
    <p className="dialog-intro">Who paid, what it cost, and the bill to go with it.</p><form ref={formRef} onSubmit={submit} noValidate><div className="form-layout"><div className="form-fields">
      <label className="field">Store or description <span className="required-label">Required</span><input autoFocus name="description" value={values.description} onChange={e => update('description', e.target.value)} placeholder="e.g. Weekly grocery run" maxLength={160} required aria-invalid={!!errors.description} aria-describedby={errors.description ? 'error-description' : undefined} />{errorFor('description')}</label>
      <div className="field-grid"><label className="field">Date<input name="date" type="date" max={currentDate} value={values.date} onChange={e => update('date', e.target.value)} required aria-invalid={!!errors.date} aria-describedby={errors.date ? 'error-date' : undefined} />{errorFor('date')}</label><label className="field">Category<select name="category" value={values.category} onChange={e => update('category', e.target.value)} required aria-invalid={!!errors.category} aria-describedby={errors.category ? 'error-category' : undefined}>{categories.map(category => <option key={category}>{category}</option>)}</select>{errorFor('category')}</label></div>
      <label className="field">Amount (USD)<div className="money-input"><span>$</span><input name="amount" inputMode="decimal" value={values.amount} onChange={e => update('amount', e.target.value)} placeholder="0.00" maxLength={11} required aria-invalid={!!errors.amount} aria-describedby={errors.amount ? 'error-amount' : undefined} /></div>{errorFor('amount')}</label>
      <label className="field">Paid by <span className="required-label">Required</span><input name="paidBy" value={values.paidBy} onChange={e => update('paidBy', e.target.value)} placeholder="Name of the person who paid" maxLength={80} required aria-invalid={!!errors.paidBy} aria-describedby={errors.paidBy ? 'error-paidBy' : undefined} />{errorFor('paidBy')}</label>
      <label className="field">Notes <span className="optional-label">Optional</span><textarea name="notes" value={values.notes} onChange={e => update('notes', e.target.value)} placeholder="Anything you want to remember" rows={3} maxLength={1000} /></label>
    </div><div className="receipt-field"><div className="receipt-field-heading">Bill photo <span className="required-label">Required</span></div><p>Attach the original bill to this expense.</p><div className={`upload-area ${ready ? 'has-photo' : ''}`}>
      {preview && ready ? <img src={preview} alt="Preview of the bill you selected" /> : <><span className="upload-icon"><Icon name="upload" /></span><strong>{reading ? 'Checking your photo…' : 'Keep the bill with the expense'}</strong><p>JPEG, PNG, or WebP<br />Up to 10 MB</p></>}
      <input ref={fileRef} hidden id="bill-photo" type="file" accept="image/jpeg,image/png,image/webp" onChange={choose} aria-label="Choose bill photo" />
      <button ref={chooseRef} className="button secondary" type="button" disabled={saving} aria-describedby={errors.receipt ? 'error-receipt' : 'receipt-help'} onClick={() => fileRef.current?.click()}><Icon name="paperclip" />{file ? 'Replace photo' : 'Choose photo'}</button>
      <input ref={cameraRef} hidden type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={choose} aria-label="Take bill photo" />
      {!file ? <button className="text-button" type="button" onClick={() => cameraRef.current?.click()}><Icon name="camera" />Take a photo</button> : null}
    </div>{file ? <div className="file-info"><span title={file.name}>{file.name}<small>{(file.size / 1024 / 1024).toFixed(2)} MB{ready ? ' · Ready to attach' : ''}</small></span><button className="icon-button" type="button" onClick={remove} aria-label="Remove bill photo"><Icon name="close" /></button></div> : null}{errorFor('receipt')}<p className="receipt-help" id="receipt-help">A bill photo is required to save. Photos stay in this tab for now.</p></div></div>
    {Object.values(errors).some(Boolean) ? <p className="form-error" role="alert">Check the highlighted fields before saving.</p> : null}{saveError ? <p className="form-error" role="alert">{saveError}</p> : null}
    <footer className="dialog-footer"><span><Icon name="paperclip" />One expense, one bill</span><div><button className="button secondary" type="button" onClick={onClose}>Cancel</button><button className="button primary" type="submit" disabled={saving || reading}><Icon name="check" />{saving ? 'Adding…' : 'Add expense'}</button></div></footer></form>
  </Dialog>
}
