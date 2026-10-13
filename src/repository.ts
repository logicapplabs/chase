import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { fromRow, toRow, type ChaseRow } from '@shared/schedule'
import type { Chase, QuickTitle } from '@shared/types'

const LOCAL_KEY = 'chase.local.v1'
const CACHE_KEY = 'chase.cache.v1'
const TITLES_KEY = 'chase.titles.v1'
const TITLES_CACHE_KEY = 'chase.titles.cache.v1'
const OUTBOX_KEY = 'chase.outbox.v1'
const MIGRATED_KEY = 'chase.migrated.v1'
const TITLES_MIGRATED_KEY = 'chase.titles.migrated.v1'

export interface SessionUser {
  id: string
  email: string
}

type Op =
  | { kind: 'upsert'; chase: Chase }
  | { kind: 'delete'; id: string }
  | { kind: 'upsert-title'; title: QuickTitle }
  | { kind: 'delete-title'; id: string }

interface TitleRow {
  id: string
  user_id: string
  label: string
  position: number
}

export interface Repository {
  mode: 'local' | 'cloud'
  currentUser(): Promise<SessionUser | null>
  signIn(email: string, password: string): Promise<void>
  signUp(email: string, password: string): Promise<'signed-in' | 'confirm-email'>
  signOut(): Promise<void>
  onAuth(cb: () => void): () => void
  list(): Promise<Chase[]>
  save(chase: Chase): Promise<void>
  remove(id: string): Promise<void>
  listTitles(): Promise<QuickTitle[]>
  saveTitle(title: QuickTitle): Promise<void>
  removeTitle(id: string): Promise<void>
  subscribe(cb: () => void): () => void
  saveSubscription(json: PushSubscriptionJSON): Promise<void>
  close(): void
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function isOffline(err: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  const message = err instanceof Error ? err.message : String(err)
  return /fetch|network|failed to fetch/i.test(message)
}

class LocalRepository implements Repository {
  mode = 'local' as const
  private listeners = new Set<() => void>()
  private onStorage = (event: StorageEvent) => {
    if (event.key === LOCAL_KEY || event.key === TITLES_KEY) this.emit()
  }

  constructor() {
    window.addEventListener('storage', this.onStorage)
  }

  close() {
    window.removeEventListener('storage', this.onStorage)
  }

  async currentUser() {
    return { id: 'local', email: '' }
  }
  async signIn() {
    throw new Error('Add Supabase keys in .env.local to sign in.')
  }
  async signUp(): Promise<'signed-in'> {
    throw new Error('Add Supabase keys in .env.local to create an account.')
  }
  async signOut() {}
  onAuth() {
    return () => {}
  }
  async list() {
    return readJson<Chase[]>(LOCAL_KEY, [])
  }
  async save(chase: Chase) {
    const all = readJson<Chase[]>(LOCAL_KEY, [])
    const index = all.findIndex((item) => item.id === chase.id)
    if (index >= 0) all[index] = chase
    else all.unshift(chase)
    localStorage.setItem(LOCAL_KEY, JSON.stringify(all))
  }
  async remove(id: string) {
    const next = readJson<Chase[]>(LOCAL_KEY, []).filter((item) => item.id !== id)
    localStorage.setItem(LOCAL_KEY, JSON.stringify(next))
  }
  async listTitles() {
    return readJson<QuickTitle[]>(TITLES_KEY, []).sort((a, b) => a.position - b.position || a.label.localeCompare(b.label))
  }
  async saveTitle(title: QuickTitle) {
    const all = readJson<QuickTitle[]>(TITLES_KEY, [])
    const index = all.findIndex((item) => item.id === title.id)
    if (index >= 0) all[index] = title
    else all.push(title)
    localStorage.setItem(TITLES_KEY, JSON.stringify(all))
  }
  async removeTitle(id: string) {
    const next = readJson<QuickTitle[]>(TITLES_KEY, []).filter((item) => item.id !== id)
    localStorage.setItem(TITLES_KEY, JSON.stringify(next))
  }
  subscribe(cb: () => void) {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }
  async saveSubscription() {
    throw new Error('Closed-app reminders need Supabase and a VAPID key.')
  }
  private emit() {
    this.listeners.forEach((cb) => cb())
  }
}

class CloudRepository implements Repository {
  mode = 'cloud' as const
  private listeners = new Set<() => void>()
  private onOnline = () => {
    void this.flush().finally(() => this.emit())
  }

  constructor(private supabase: SupabaseClient) {
    this.channel = supabase
      .channel('chases')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chases' }, () => this.emit())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'quick_titles' }, () => this.emit())
      .subscribe()
    window.addEventListener('online', this.onOnline)
  }

  private channel: ReturnType<SupabaseClient['channel']>

  close() {
    window.removeEventListener('online', this.onOnline)
    void this.supabase.removeChannel(this.channel)
  }

  async currentUser() {
    const { data } = await this.supabase.auth.getSession()
    const user = data.session?.user
    if (!user) return null
    return { id: user.id, email: user.email ?? '' }
  }

  async signIn(email: string, password: string) {
    const { error } = await this.supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }

  async signUp(email: string, password: string) {
    const { data, error } = await this.supabase.auth.signUp({ email, password })
    if (error) throw error
    return data.session ? 'signed-in' : 'confirm-email'
  }

  async signOut() {
    const { error } = await this.supabase.auth.signOut()
    if (error) throw error
  }

  onAuth(cb: () => void) {
    const { data } = this.supabase.auth.onAuthStateChange(() => cb())
    return () => data.subscription.unsubscribe()
  }

  async list() {
    await this.flush()
    try {
      const { data, error } = await this.supabase.from('chases').select('*').order('updated_at', { ascending: false })
      if (error) throw error
      const chases = (data ?? []).map((row) => fromRow(row as ChaseRow))
      localStorage.setItem(CACHE_KEY, JSON.stringify(chases))
      return chases
    } catch (err) {
      if (isOffline(err)) return readJson<Chase[]>(CACHE_KEY, [])
      throw err
    }
  }

  async save(chase: Chase) {
    const user = await this.requireUser()
    const row = { ...chase, userId: user.id }
    try {
      const { error } = await this.supabase.from('chases').upsert(toRow(row))
      if (error) throw error
    } catch (err) {
      if (!isOffline(err)) throw err
      this.enqueue({ kind: 'upsert', chase: row })
    }
  }

  async remove(id: string) {
    try {
      const { error } = await this.supabase.from('chases').delete().eq('id', id)
      if (error) throw error
    } catch (err) {
      if (!isOffline(err)) throw err
      this.enqueue({ kind: 'delete', id })
    }
  }

  async listTitles() {
    await this.flush()
    try {
      const { data, error } = await this.supabase.from('quick_titles').select('*').order('position')
      if (error) throw error
      const titles = ((data ?? []) as TitleRow[]).map(fromTitleRow)
      localStorage.setItem(TITLES_CACHE_KEY, JSON.stringify(titles))
      return titles
    } catch (err) {
      if (isOffline(err)) return readJson<QuickTitle[]>(TITLES_CACHE_KEY, [])
      throw err
    }
  }

  async saveTitle(title: QuickTitle) {
    const user = await this.requireUser()
    const row = { ...title, userId: user.id }
    try {
      const { error } = await this.supabase.from('quick_titles').upsert(toTitleRow(row))
      if (error) throw error
    } catch (err) {
      if (!isOffline(err)) throw err
      this.enqueue({ kind: 'upsert-title', title: row })
    }
  }

  async removeTitle(id: string) {
    try {
      const { error } = await this.supabase.from('quick_titles').delete().eq('id', id)
      if (error) throw error
    } catch (err) {
      if (!isOffline(err)) throw err
      this.enqueue({ kind: 'delete-title', id })
    }
  }

  subscribe(cb: () => void) {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  async saveSubscription(json: PushSubscriptionJSON) {
    const endpoint = json.endpoint
    const p256dh = json.keys?.p256dh
    const auth = json.keys?.auth
    if (!endpoint || !p256dh || !auth) throw new Error('Incomplete push subscription.')
    const user = await this.requireUser()
    const { error } = await this.supabase.from('push_subscriptions').upsert(
      { user_id: user.id, endpoint, p256dh, auth },
      { onConflict: 'endpoint' },
    )
    if (error) throw error
  }

  private async requireUser() {
    const user = await this.currentUser()
    if (!user) throw new Error('Sign in to sync.')
    return user
  }

  private enqueue(op: Op) {
    const all = readJson<Op[]>(OUTBOX_KEY, [])
    all.push(op)
    localStorage.setItem(OUTBOX_KEY, JSON.stringify(all))
  }

  private async flush() {
    const user = await this.currentUser()
    if (!user) return
    try {
      await this.migrate(user.id)
    } catch {
      // Keep on-device rows and try the upload again next time.
    }
    const ops = collapse(readJson<Op[]>(OUTBOX_KEY, []))
    const remain: Op[] = []
    for (const op of ops) {
      try {
        if (op.kind === 'delete') {
          const { error } = await this.supabase.from('chases').delete().eq('id', op.id)
          if (error) throw error
        } else if (op.kind === 'upsert') {
          const { error } = await this.supabase.from('chases').upsert(toRow({ ...op.chase, userId: user.id }))
          if (error) throw error
        } else if (op.kind === 'delete-title') {
          const { error } = await this.supabase.from('quick_titles').delete().eq('id', op.id)
          if (error) throw error
        } else {
          const { error } = await this.supabase.from('quick_titles').upsert(toTitleRow({ ...op.title, userId: user.id }))
          if (error) throw error
        }
      } catch {
        remain.push(op)
      }
    }
    localStorage.setItem(OUTBOX_KEY, JSON.stringify(remain))
  }

  private async migrate(userId: string) {
    if (!localStorage.getItem(MIGRATED_KEY)) {
      const local = readJson<Chase[]>(LOCAL_KEY, [])
      for (const chase of local) {
        const { error } = await this.supabase.from('chases').upsert(toRow({ ...chase, userId }))
        if (error) throw error
      }
      localStorage.setItem(MIGRATED_KEY, '1')
    }
    await this.migrateTitles(userId)
  }

  private async migrateTitles(userId: string) {
    if (localStorage.getItem(TITLES_MIGRATED_KEY)) return
    const local = readJson<QuickTitle[]>(TITLES_KEY, [])
    for (const title of local) {
      const { error } = await this.supabase.from('quick_titles').upsert(toTitleRow({ ...title, userId }))
      if (error) throw error
    }
    localStorage.setItem(TITLES_MIGRATED_KEY, '1')
  }

  private emit() {
    this.listeners.forEach((cb) => cb())
  }
}

function opKey(op: Op): string {
  if (op.kind === 'upsert') return `chase:${op.chase.id}`
  if (op.kind === 'delete') return `chase:${op.id}`
  if (op.kind === 'upsert-title') return `title:${op.title.id}`
  return `title:${op.id}`
}

function toTitleRow(title: QuickTitle) {
  return { id: title.id, user_id: title.userId, label: title.label, position: title.position }
}

function fromTitleRow(row: TitleRow): QuickTitle {
  return { id: row.id, userId: row.user_id, label: row.label, position: row.position }
}

function collapse(ops: Op[]): Op[] {
  const map = new Map<string, Op>()
  const order: string[] = []
  for (const op of ops) {
    const id = opKey(op)
    if (!map.has(id)) order.push(id)
    map.set(id, op)
  }
  return order.map((id) => map.get(id) as Op)
}

export function createRepository(): Repository {
  const url = import.meta.env.VITE_SUPABASE_URL
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) return new LocalRepository()
  return new CloudRepository(createClient(url, key))
}
