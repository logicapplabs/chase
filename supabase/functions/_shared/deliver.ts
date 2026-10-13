import { scheduleSignature, tick } from './schedule.ts'
import type { Chase, Nudge, PushPayload, PushSub } from './types.ts'

export interface SchedulerDb {
  loadDue(now: Date): Promise<Chase[]>
  save(chase: Chase): Promise<void>
  logNudge(chase: Chase, nudge: Nudge): Promise<void>
  subscriptions(userId: string): Promise<PushSub[]>
  deleteSubscription(id: string): Promise<void>
}

export type SendPush = (sub: PushSub, payload: PushPayload) => Promise<void>

export function isGone(err: unknown): boolean {
  const status = (err as { statusCode?: number }).statusCode
  return status === 404 || status === 410
}

export async function runDue(db: SchedulerDb, send: SendPush, now: Date): Promise<{ checked: number; sent: number }> {
  const rows = await db.loadDue(now)
  let sent = 0
  for (const row of rows) {
    const { chase, nudge } = tick(row, now)
    let toSave = chase
    if (nudge) {
      const subs = await db.subscriptions(chase.userId)
      let delivered = subs.length === 0
      for (const sub of subs) {
        try {
          await send(sub, {
            title: nudge.title,
            body: nudge.body,
            url: `/#/chase/${chase.id}`,
            tag: chase.id,
          })
          delivered = true
          sent += 1
        } catch (err) {
          if (isGone(err)) await db.deleteSubscription(sub.id)
        }
      }
      if (delivered) await db.logNudge(chase, nudge)
      else {
        toSave = {
          ...chase,
          lastNudgeKey: row.lastNudgeKey,
          waitingCheckFired: row.waitingCheckFired,
          nextNudgeAt: now.toISOString(),
        }
      }
    }
    if (scheduleSignature(row) !== scheduleSignature(toSave)) await db.save(toSave)
  }
  return { checked: rows.length, sent }
}
