import { readFileSync, existsSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import webpush from 'web-push'
import { runDue } from '../supabase/functions/_shared/deliver.ts'
import { fromRow, toRow, type ChaseRow } from '../supabase/functions/_shared/schedule.ts'
import type { PushSub } from '../supabase/functions/_shared/types.ts'

function loadEnv() {
  for (const file of ['.env', '.env.local']) {
    if (!existsSync(file)) continue
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/)
      if (!match || process.env[match[1]]) continue
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, '')
    }
  }
}

loadEnv()

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const publicKey = process.env.VAPID_PUBLIC_KEY || process.env.VITE_VAPID_PUBLIC_KEY
const privateKey = process.env.VAPID_PRIVATE_KEY
const subject = process.env.VAPID_SUBJECT || 'mailto:chase@localhost'

const missing = [
  ['SUPABASE_URL or VITE_SUPABASE_URL', url],
  ['SUPABASE_SERVICE_ROLE_KEY', key],
  ['VAPID_PUBLIC_KEY', publicKey],
  ['VAPID_PRIVATE_KEY', privateKey],
].filter(([, value]) => !value)

if (missing.length || !url || !key || !publicKey || !privateKey) {
  console.error(`Missing ${missing.map(([name]) => name).join(', ')}. See .env.example.`)
  process.exit(1)
}

webpush.setVapidDetails(subject, publicKey, privateKey)
const supabase = createClient(url, key)

const result = await runDue(
  {
    async loadDue(now) {
      const { data, error } = await supabase
        .from('chases')
        .select('*')
        .neq('stage', 'done')
        .lte('next_nudge_at', now.toISOString())
      if (error) throw error
      return (data ?? []).map((row) => fromRow(row as ChaseRow))
    },
    async save(chase) {
      const { error } = await supabase.from('chases').upsert(toRow(chase))
      if (error) throw error
    },
    async logNudge(chase, nudge) {
      const { error } = await supabase.from('nudge_log').insert({
        chase_id: chase.id,
        user_id: chase.userId,
        stage: nudge.stage,
        body: `${nudge.title} — ${nudge.body}`,
        nudge_key: nudge.key,
      })
      if (error) throw error
    },
    async subscriptions(userId) {
      const { data, error } = await supabase.from('push_subscriptions').select('*').eq('user_id', userId)
      if (error) throw error
      return (data ?? []) as PushSub[]
    },
    async deleteSubscription(id) {
      const { error } = await supabase.from('push_subscriptions').delete().eq('id', id)
      if (error) throw error
    },
  },
  async (sub, payload) => {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload),
    )
  },
  new Date(),
)

console.log(`Checked ${result.checked}, sent ${result.sent}.`)
