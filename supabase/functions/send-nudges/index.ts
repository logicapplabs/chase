import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'
import { runDue, type SendPush } from '../_shared/deliver.ts'
import { fromRow, toRow, type ChaseRow } from '../_shared/schedule.ts'
import type { PushSub } from '../_shared/types.ts'

Deno.serve(async (req) => {
  const secret = Deno.env.get('CRON_SECRET')
  if (secret && req.headers.get('x-cron-secret') !== secret) {
    return new Response('unauthorized', { status: 401 })
  }

  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY') ?? Deno.env.get('VITE_VAPID_PUBLIC_KEY')
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY')
  const subject = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:chase@localhost'
  if (!url || !key || !publicKey || !privateKey) {
    return new Response('missing scheduler env', { status: 500 })
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
    (async (sub, payload) => {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload),
      )
    }) as SendPush,
    new Date(),
  )

  return Response.json(result)
})
