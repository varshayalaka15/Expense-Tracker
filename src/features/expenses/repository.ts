import type { SupabaseClient } from '@supabase/supabase-js'
import { UnconfirmedSaveError, validateForm, validateReceipt } from './model.ts'
import type { Category, Expense, ExpenseDraft } from './model.ts'

export const receiptBucket = 'receipts'
interface ExpenseRow {
  id: string; user_id: string; date: string; description: string; category: Category
  amount_cents: number; paid_by: string; notes: string
  receipt_path: string; receipt_name: string; receipt_size: number; created_at: string; uploader_email?: string
}
export function expenseFromRow(row: ExpenseRow): Expense {
  return { id: row.id, ownerId: row.user_id, uploaderEmail: row.uploader_email, date: row.date, description: row.description, category: row.category,
    amountCents: row.amount_cents, paidBy: row.paid_by, notes: row.notes,
    createdAt: Date.parse(row.created_at), sample: false,
    receipt: { url: '', path: row.receipt_path, name: row.receipt_name, size: row.receipt_size } }
}

export function createExpenseRepository(client: SupabaseClient) {
  const storage = () => client.storage.from(receiptBucket)
  async function cleanup(path: string) {
    try {
      const { error } = await storage().remove([path])
      return !error
    } catch { return false }
  }
  return {
    async listAdmin(): Promise<Expense[]> {
      const rows: ExpenseRow[] = []
      const pageSize = 500
      for (let start = 0; ; start += pageSize) {
        const { data, error } = await client.rpc('list_admin_expenses')
          .order('date', { ascending: false }).order('created_at', { ascending: false }).order('id')
          .range(start, start + pageSize - 1)
        if (error) throw new Error('Could not load submitted bills. Check your admin access and connection, then retry.')
        rows.push(...data as ExpenseRow[])
        if (data.length < pageSize) break
      }
      return rows.map(expenseFromRow)
    },
    async list(userId: string): Promise<Expense[]> {
      // Page through all records rather than silently truncating dashboard totals at 1,000.
      const rows: ExpenseRow[] = []
      const pageSize = 500
      for (let start = 0; ; start += pageSize) {
        const { data, error } = await client.from('expenses').select('*').eq('user_id', userId)
          .order('date', { ascending: false }).order('created_at', { ascending: false }).order('id')
          .range(start, start + pageSize - 1)
        if (error) throw new Error('Could not load expenses. Check your connection and retry.')
        rows.push(...data as ExpenseRow[])
        if (data.length < pageSize) break
      }
      return rows.map(expenseFromRow)
    },
    async receiptUrl(path: string): Promise<string> {
      const { data, error } = await storage().createSignedUrl(path, 300)
      if (error || !data?.signedUrl) throw new Error('Could not open the bill. Please retry.')
      return data.signedUrl
    },
    async save(userId: string, draft: ExpenseDraft, file: File | null, existing?: Expense): Promise<{ expense: Expense; cleanupFailed: boolean }> {
      const errors = validateForm({ ...draft, amount: (draft.amountCents / 100).toFixed(2) }, Boolean(file || existing?.receipt.path))
      if (!Number.isSafeInteger(draft.amountCents) || Object.keys(errors).length) throw new Error('Check the expense details and attach a bill photo before saving.')
      if (file) { const error = validateReceipt(file); if (error) throw new Error(error) }
      const id = existing?.id ?? crypto.randomUUID()
      // The actor may be an admin. Editing must preserve the original owner.
      const ownerId = existing?.ownerId ?? userId
      let receipt = existing?.receipt
      let uploadedPath: string | undefined
      if (file) {
        const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[file.type]
        uploadedPath = `${ownerId}/${id}/${crypto.randomUUID()}.${extension}`
        try {
          const { error } = await storage().upload(uploadedPath, file, { contentType: file.type, upsert: false })
          if (error) throw error
        } catch {
          // The upload itself may have committed before its response was lost.
          // No expense references this fresh path yet, so cleanup is safe.
          const removed = await cleanup(uploadedPath)
          throw new Error(`The bill could not be uploaded. Check your connection and try again.${removed ? '' : ' An unused bill may remain in storage; contact the project administrator to clean it up.'}`)
        }
        receipt = { path: uploadedPath, url: '', name: file.name, size: file.size }
      }
      if (!receipt?.path) throw new Error('Attach a bill photo before saving.')
      const row = { id, user_id: ownerId, date: draft.date, description: draft.description.trim(), category: draft.category,
        amount_cents: draft.amountCents, paid_by: draft.paidBy.trim(), notes: draft.notes.trim(),
        receipt_path: receipt.path, receipt_name: receipt.name, receipt_size: receipt.size }
      let result: ExpenseRow
      try {
        const request = existing
          ? client.from('expenses').update(row).eq('id', id).eq('user_id', ownerId)
          : client.from('expenses').insert(row)
        const { data, error } = await request.select('*').single()
        if (error || !data) throw new Error('Save failed')
        result = data as ExpenseRow
      } catch {
        // A connection loss may happen after the database commits. Read back before
        // deleting a photo or inviting a retry that could create a duplicate entry.
        let confirmed: ExpenseRow | null = null
        let outcomeKnown = false
        try {
          const { data, error } = await client.from('expenses').select('*').eq('id', id).eq('user_id', ownerId).maybeSingle()
          outcomeKnown = !error
          confirmed = data as ExpenseRow | null
        } catch { /* Keep the uploaded bill if the commit outcome is unknown. */ }
        if (confirmed && confirmed.receipt_path === row.receipt_path && confirmed.description === row.description
          && confirmed.amount_cents === row.amount_cents && confirmed.date === row.date
          && confirmed.category === row.category && confirmed.paid_by === row.paid_by && confirmed.notes === row.notes) {
          result = confirmed
        } else {
          if (!outcomeKnown) throw new UnconfirmedSaveError('Could not confirm whether the expense was saved. Close this form to reload your expense list before trying again.')
          const removed = !uploadedPath || confirmed?.receipt_path === uploadedPath || await cleanup(uploadedPath)
          throw new Error(`The expense could not be saved. Your form is still here; please retry.${removed ? '' : ' An unused bill remains in storage; contact the project administrator to clean it up.'}`)
        }
      }
      const cleanupFailed = Boolean(uploadedPath && existing?.receipt.path && !(await cleanup(existing.receipt.path)))
      return { expense: { ...expenseFromRow(result), uploaderEmail: existing?.uploaderEmail }, cleanupFailed }
    },
    async remove(userId: string, expense: Expense): Promise<{ cleanupFailed: boolean }> {
      const { data, error } = await client.from('expenses').delete().eq('id', expense.id).eq('user_id', expense.ownerId ?? userId).select('id')
      if (error || data?.length !== 1) throw new Error('The expense could not be deleted. Refresh your list before trying again.')
      return { cleanupFailed: Boolean(expense.receipt.path && !(await cleanup(expense.receipt.path))) }
    },
  }
}
