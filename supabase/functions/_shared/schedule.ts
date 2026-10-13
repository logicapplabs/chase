import { formatWhen } from './format.ts'
import { promptFor } from './templates.ts'
import type { Chase, Nudge, Stage } from './types.ts'

export interface TimingInput {
  doItAt: string | null
  confirmSentMode: Chase['confirmSentMode']
  confirmSentDelayHours: number
  confirmSentAt: string | null
  waitingCheckAt: string | null
  expectedBackAt: string | null
  confirmBackRepeatHours: number
  morningHour: number
  stageLabels: Chase['stageLabels']
  title: string
  jobLabel: string
}

export function nextMorningAfter(anchor: Date, hour: number): Date {
  const morning = new Date(anchor)
  morning.setHours(hour, 0, 0, 0)
  if (morning.getTime() <= anchor.getTime()) morning.setDate(morning.getDate() + 1)
  return morning
}

export function confirmSentDeadline(chase: Chase): Date | null {
  const anchor = new Date(chase.doItAt ?? chase.stageEnteredAt)
  if (Number.isNaN(anchor.getTime())) return null
  if (chase.confirmSentMode === 'at' && chase.confirmSentAt) {
    const at = new Date(chase.confirmSentAt)
    if (!Number.isNaN(at.getTime())) return at
  }
  if (chase.confirmSentMode === 'delay_hours') {
    const hours = Math.max(1, chase.confirmSentDelayHours)
    return new Date(anchor.getTime() + hours * 60 * 60 * 1000)
  }
  return nextMorningAfter(anchor, chase.morningHour)
}

function repeatMs(chase: Chase): number {
  return Math.max(1, chase.confirmBackRepeatHours) * 60 * 60 * 1000
}

function backStart(chase: Chase): Date {
  return new Date(chase.expectedBackAt ?? chase.stageEnteredAt)
}

function currentBackSlot(chase: Chase, now: Date): Date | null {
  const start = backStart(chase)
  if (Number.isNaN(start.getTime()) || now.getTime() < start.getTime()) return null
  const steps = Math.floor((now.getTime() - start.getTime()) / repeatMs(chase))
  return new Date(start.getTime() + steps * repeatMs(chase))
}

function nextBackSlot(chase: Chase, now: Date): Date {
  const start = backStart(chase)
  if (now.getTime() < start.getTime()) return start
  const current = currentBackSlot(chase, now) ?? start
  const key = `confirm_back:${current.toISOString()}`
  if (chase.lastNudgeKey !== key && now.getTime() >= current.getTime()) return current
  return new Date(current.getTime() + repeatMs(chase))
}

function earliest(dates: Array<Date | null>): Date | null {
  const valid = dates.filter((d): d is Date => d != null && !Number.isNaN(d.getTime()))
  if (!valid.length) return null
  return valid.reduce((a, b) => (a.getTime() <= b.getTime() ? a : b))
}

export function computeNext(chase: Chase, now: Date): Date | null {
  if (chase.stage === 'done') return null
  if (chase.snoozeUntil) {
    const snooze = new Date(chase.snoozeUntil)
    if (snooze.getTime() > now.getTime()) return snooze
  }
  if (chase.stage === 'do_it') {
    const doIt =
      chase.doItAt && chase.lastNudgeKey !== `do_it:${chase.doItAt}` ? new Date(chase.doItAt) : null
    return earliest([doIt, confirmSentDeadline(chase)])
  }
  if (chase.stage === 'confirm_sent') {
    const key = `confirm_sent:${chase.stageEnteredAt}`
    if (chase.lastNudgeKey === key) return null
    return new Date(chase.stageEnteredAt)
  }
  if (chase.stage === 'waiting') {
    const check = chase.waitingCheckAt && !chase.waitingCheckFired ? new Date(chase.waitingCheckAt) : null
    const back = chase.expectedBackAt ? new Date(chase.expectedBackAt) : null
    return earliest([check, back])
  }
  if (chase.stage === 'confirm_back') return nextBackSlot(chase, now)
  return null
}

function enterStage(chase: Chase, stage: Stage, at: string, keepSnooze = false): Chase {
  return {
    ...chase,
    stage,
    stageEnteredAt: at,
    lastNudgeKey: null,
    snoozeUntil: keepSnooze ? chase.snoozeUntil : null,
    updatedAt: at,
  }
}

function autoAdvance(chase: Chase, now: Date): Chase {
  if (chase.stage === 'do_it') {
    const deadline = confirmSentDeadline(chase)
    if (deadline && now.getTime() >= deadline.getTime()) {
      return enterStage(chase, 'confirm_sent', deadline.toISOString(), true)
    }
  }
  if (chase.stage === 'waiting' && chase.expectedBackAt) {
    const back = new Date(chase.expectedBackAt)
    if (!Number.isNaN(back.getTime()) && now.getTime() >= back.getTime()) {
      return enterStage(chase, 'confirm_back', chase.expectedBackAt, true)
    }
  }
  return chase
}

function makeNudge(chase: Chase, stage: Stage, key: string): Nudge {
  const body = chase.jobLabel ? `${chase.title} — ${chase.jobLabel}` : chase.title
  return { key, stage, title: promptFor(chase, stage), body }
}

function dueNudge(chase: Chase, now: Date): Nudge | null {
  if (chase.stage === 'do_it') {
    if (!chase.doItAt || now.getTime() < new Date(chase.doItAt).getTime()) return null
    const key = `do_it:${chase.doItAt}`
    if (chase.lastNudgeKey === key) return null
    return makeNudge(chase, 'do_it', key)
  }
  if (chase.stage === 'confirm_sent') {
    if (now.getTime() < new Date(chase.stageEnteredAt).getTime()) return null
    const key = `confirm_sent:${chase.stageEnteredAt}`
    if (chase.lastNudgeKey === key) return null
    return makeNudge(chase, 'confirm_sent', key)
  }
  if (chase.stage === 'waiting') {
    if (!chase.waitingCheckAt || chase.waitingCheckFired) return null
    if (now.getTime() < new Date(chase.waitingCheckAt).getTime()) return null
    const key = `waiting:${chase.waitingCheckAt}`
    if (chase.lastNudgeKey === key) return null
    return makeNudge(chase, 'waiting', key)
  }
  if (chase.stage === 'confirm_back') {
    const slot = currentBackSlot(chase, now)
    if (!slot) return null
    const key = `confirm_back:${slot.toISOString()}`
    if (chase.lastNudgeKey === key) return null
    return makeNudge(chase, 'confirm_back', key)
  }
  return null
}

export function withNext(chase: Chase, now: Date): Chase {
  return { ...chase, nextNudgeAt: computeNext(chase, now)?.toISOString() ?? null }
}

export function tick(chase: Chase, now: Date): { chase: Chase; nudge: Nudge | null } {
  if (chase.stage === 'done') return { chase: { ...chase, nextNudgeAt: null }, nudge: null }

  let next = autoAdvance(chase, now)
  if (next.snoozeUntil && new Date(next.snoozeUntil).getTime() <= now.getTime()) {
    next = { ...next, snoozeUntil: null }
  }

  const snoozed = next.snoozeUntil != null && new Date(next.snoozeUntil).getTime() > now.getTime()
  const nudge = snoozed ? null : dueNudge(next, now)
  if (nudge) {
    next = {
      ...next,
      lastNudgeKey: nudge.key,
      waitingCheckFired: next.stage === 'waiting' ? true : next.waitingCheckFired,
      snoozeUntil: null,
      updatedAt: now.toISOString(),
    }
  }
  next = withNext(next, now)
  return { chase: next, nudge }
}

export function scheduleSignature(chase: Chase): string {
  return JSON.stringify([
    chase.stage,
    chase.stageEnteredAt,
    chase.lastNudgeKey,
    chase.nextNudgeAt,
    chase.waitingCheckFired,
    chase.snoozeUntil,
    chase.doItAt,
    chase.expectedBackAt,
    chase.waitingCheckAt,
  ])
}

export function markStageDone(chase: Chase, now: Date): Chase {
  const at = now.toISOString()
  if (chase.stage === 'do_it' || chase.stage === 'confirm_sent') {
    return withNext(enterStage(chase, 'waiting', at), now)
  }
  if (chase.stage === 'waiting' || chase.stage === 'confirm_back') {
    return withNext(enterStage(chase, 'done', at), now)
  }
  return chase
}

export function sayNotYet(chase: Chase, now: Date): Chase {
  if (chase.stage === 'confirm_sent') {
    const doIt = new Date(now.getTime() + 60 * 60 * 1000).toISOString()
    return withNext(enterStage({ ...chase, doItAt: doIt }, 'do_it', now.toISOString()), now)
  }
  if (chase.stage === 'confirm_back') {
    const expected = new Date(now.getTime() + repeatMs(chase)).toISOString()
    return withNext(
      enterStage(
        { ...chase, expectedBackAt: expected, waitingCheckAt: null, waitingCheckFired: true },
        'waiting',
        now.toISOString(),
      ),
      now,
    )
  }
  return chase
}

export function snoozeToMorning(chase: Chase, now: Date): Chase {
  const morning = new Date(now)
  morning.setDate(morning.getDate() + 1)
  morning.setHours(chase.morningHour, 0, 0, 0)
  return withNext(
    {
      ...chase,
      snoozeUntil: morning.toISOString(),
      lastNudgeKey: null,
      waitingCheckFired: chase.stage === 'waiting' ? false : chase.waitingCheckFired,
      updatedAt: now.toISOString(),
    },
    now,
  )
}

export function applyTiming(chase: Chase, timing: TimingInput, now: Date): Chase {
  const next: Chase = {
    ...chase,
    title: timing.title.trim(),
    jobLabel: timing.jobLabel.trim(),
    doItAt: timing.doItAt,
    confirmSentMode: timing.confirmSentMode,
    confirmSentDelayHours: Math.max(1, timing.confirmSentDelayHours),
    confirmSentAt: timing.confirmSentAt,
    waitingCheckAt: timing.waitingCheckAt,
    expectedBackAt: timing.expectedBackAt,
    confirmBackRepeatHours: Math.max(1, timing.confirmBackRepeatHours),
    morningHour: timing.morningHour,
    stageLabels: timing.stageLabels,
    snoozeUntil: null,
    updatedAt: now.toISOString(),
  }
  if (timing.waitingCheckAt !== chase.waitingCheckAt) next.waitingCheckFired = false
  if (
    (next.stage === 'do_it' || next.stage === 'confirm_sent') &&
    next.doItAt &&
    new Date(next.doItAt).getTime() > now.getTime()
  ) {
    if (next.stage === 'confirm_sent') {
      next.stage = 'do_it'
      next.stageEnteredAt = now.toISOString()
    }
    next.lastNudgeKey = null
  }
  if (next.stage === 'confirm_back' && next.expectedBackAt && new Date(next.expectedBackAt).getTime() > now.getTime()) {
    next.stage = 'waiting'
    next.stageEnteredAt = now.toISOString()
    next.lastNudgeKey = null
  }
  return withNext(next, now)
}

export function newChase(
  input: TimingInput & { template: Chase['template']; id?: string; userId?: string; now?: Date },
): Chase {
  const now = input.now ?? new Date()
  const at = now.toISOString()
  const chase: Chase = {
    id: input.id ?? crypto.randomUUID(),
    userId: input.userId ?? 'local',
    title: input.title.trim(),
    jobLabel: input.jobLabel.trim(),
    template: input.template,
    stageLabels: input.stageLabels,
    stage: 'do_it',
    stageEnteredAt: at,
    doItAt: input.doItAt,
    confirmSentMode: input.confirmSentMode,
    confirmSentDelayHours: Math.max(1, input.confirmSentDelayHours),
    confirmSentAt: input.confirmSentAt,
    morningHour: input.morningHour,
    waitingCheckAt: input.waitingCheckAt,
    expectedBackAt: input.expectedBackAt,
    confirmBackRepeatHours: Math.max(1, input.confirmBackRepeatHours),
    snoozeUntil: null,
    lastNudgeKey: null,
    waitingCheckFired: false,
    nextNudgeAt: null,
    createdAt: at,
    updatedAt: at,
  }
  return withNext(chase, now)
}

function labelFor(chase: Chase, at: Date): string {
  if (chase.snoozeUntil && new Date(chase.snoozeUntil).getTime() === at.getTime()) return 'Snoozed'
  if (chase.doItAt && new Date(chase.doItAt).getTime() === at.getTime()) return promptFor(chase, 'do_it')
  const deadline = confirmSentDeadline(chase)
  if (deadline && deadline.getTime() === at.getTime()) return promptFor(chase, 'confirm_sent')
  if (chase.waitingCheckAt && new Date(chase.waitingCheckAt).getTime() === at.getTime()) {
    return promptFor(chase, 'waiting')
  }
  if (chase.expectedBackAt && new Date(chase.expectedBackAt).getTime() === at.getTime()) {
    return promptFor(chase, 'confirm_back')
  }
  if (chase.stage === 'confirm_sent') return promptFor(chase, 'confirm_sent')
  if (chase.stage === 'confirm_back') return promptFor(chase, 'confirm_back')
  return promptFor(chase, chase.stage)
}

export function glance(chase: Chase, now: Date): string | null {
  if (chase.stage === 'done') return null
  if (!chase.nextNudgeAt) {
    if (chase.stage === 'confirm_sent') return 'Still unchecked'
    if (chase.stage === 'waiting') return 'Quiet until it should be back'
    if (chase.stage === 'do_it') return 'No reminder set'
    return 'Waiting on you'
  }
  const at = new Date(chase.nextNudgeAt)
  return `${labelFor(chase, at)} · ${formatWhen(at, now)}`
}

export interface Upcoming {
  at: string
  label: string
}

export function upcoming(chase: Chase, now: Date): Upcoming[] {
  if (chase.stage === 'done') return []
  const events: Upcoming[] = []
  const push = (at: Date | null, label: string) => {
    if (!at || Number.isNaN(at.getTime())) return
    if (at.getTime() < now.getTime() - 60_000) return
    events.push({ at: at.toISOString(), label })
  }
  if (chase.snoozeUntil) push(new Date(chase.snoozeUntil), 'Snoozed')
  if (chase.stage === 'do_it' && chase.lastNudgeKey !== `do_it:${chase.doItAt}`) {
    push(chase.doItAt ? new Date(chase.doItAt) : null, promptFor(chase, 'do_it'))
  }
  if (chase.stage === 'do_it') push(confirmSentDeadline(chase), promptFor(chase, 'confirm_sent'))
  if (chase.stage === 'confirm_sent' && chase.lastNudgeKey !== `confirm_sent:${chase.stageEnteredAt}`) {
    push(new Date(chase.stageEnteredAt), promptFor(chase, 'confirm_sent'))
  }
  if (chase.stage === 'do_it' || chase.stage === 'confirm_sent' || chase.stage === 'waiting') {
    if (!chase.waitingCheckFired) push(chase.waitingCheckAt ? new Date(chase.waitingCheckAt) : null, promptFor(chase, 'waiting'))
    push(chase.expectedBackAt ? new Date(chase.expectedBackAt) : null, promptFor(chase, 'confirm_back'))
  }
  if (chase.stage === 'confirm_back') {
    const slot = nextBackSlot(chase, now)
    push(slot, promptFor(chase, 'confirm_back'))
    push(new Date(slot.getTime() + repeatMs(chase)), promptFor(chase, 'confirm_back'))
  }
  const seen = new Set<string>()
  return events
    .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
    .filter((event) => {
      const key = `${event.label}:${event.at}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, 4)
}

export function dueWork(chases: Chase[], now: Date): { updates: Chase[]; nudges: Array<{ chase: Chase; nudge: Nudge }> } {
  const updates: Chase[] = []
  const nudges: Array<{ chase: Chase; nudge: Nudge }> = []
  for (const chase of chases) {
    const result = tick(chase, now)
    if (scheduleSignature(chase) !== scheduleSignature(result.chase)) updates.push(result.chase)
    if (result.nudge) nudges.push({ chase: result.chase, nudge: result.nudge })
  }
  return { updates, nudges }
}

export interface ChaseRow {
  id: string
  user_id: string
  title: string
  job_label: string | null
  template: Chase['template']
  stage_labels: [string, string, string, string] | null
  stage: Stage
  stage_entered_at: string
  do_it_at: string | null
  confirm_sent_mode: Chase['confirmSentMode']
  confirm_sent_delay_hours: number
  confirm_sent_at: string | null
  morning_hour: number
  waiting_check_at: string | null
  expected_back_at: string | null
  confirm_back_repeat_hours: number
  snooze_until: string | null
  last_nudge_key: string | null
  waiting_check_fired: boolean
  next_nudge_at: string | null
  created_at: string
  updated_at: string
}

export function toRow(chase: Chase) {
  return {
    id: chase.id,
    user_id: chase.userId,
    title: chase.title,
    job_label: chase.jobLabel || null,
    template: chase.template,
    stage_labels: chase.stageLabels,
    stage: chase.stage,
    stage_entered_at: chase.stageEnteredAt,
    do_it_at: chase.doItAt,
    confirm_sent_mode: chase.confirmSentMode,
    confirm_sent_delay_hours: chase.confirmSentDelayHours,
    confirm_sent_at: chase.confirmSentAt,
    morning_hour: chase.morningHour,
    waiting_check_at: chase.waitingCheckAt,
    expected_back_at: chase.expectedBackAt,
    confirm_back_repeat_hours: chase.confirmBackRepeatHours,
    snooze_until: chase.snoozeUntil,
    last_nudge_key: chase.lastNudgeKey,
    waiting_check_fired: chase.waitingCheckFired,
    next_nudge_at: chase.nextNudgeAt,
    created_at: chase.createdAt,
    updated_at: chase.updatedAt,
  }
}

export function fromRow(row: ChaseRow): Chase {
  const labels = Array.isArray(row.stage_labels) && row.stage_labels.length === 4 ? row.stage_labels : null
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    jobLabel: row.job_label ?? '',
    template: row.template,
    stageLabels: labels,
    stage: row.stage,
    stageEnteredAt: row.stage_entered_at,
    doItAt: row.do_it_at,
    confirmSentMode: row.confirm_sent_mode,
    confirmSentDelayHours: row.confirm_sent_delay_hours,
    confirmSentAt: row.confirm_sent_at,
    morningHour: row.morning_hour,
    waitingCheckAt: row.waiting_check_at,
    expectedBackAt: row.expected_back_at,
    confirmBackRepeatHours: row.confirm_back_repeat_hours,
    snoozeUntil: row.snooze_until,
    lastNudgeKey: row.last_nudge_key,
    waitingCheckFired: row.waiting_check_fired,
    nextNudgeAt: row.next_nudge_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
