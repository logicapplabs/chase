import type { Chase, ConfirmMode, Stage, TemplateId } from './types.ts'

const SEGMENTS: [string, string, string, string] = ['Pending', 'Check', 'In progress', 'Due back']

const PROMPTS: Record<Stage, string> = {
  do_it: 'Send it',
  confirm_sent: 'Ask if you sent it',
  waiting: 'Light check',
  confirm_back: 'Ask if it came back',
  done: 'Done',
}

const PRIMARY: Record<Exclude<Stage, 'done'>, string> = {
  do_it: 'Mark in progress',
  confirm_sent: 'Mark in progress',
  waiting: 'Mark complete',
  confirm_back: 'Mark complete',
}

export function segmentLabels(chase: Chase): [string, string, string, string] {
  if (chase.stageLabels && chase.stageLabels.length === 4) return chase.stageLabels
  return SEGMENTS
}

export function promptFor(_chase: Chase, stage: Stage): string {
  return PROMPTS[stage]
}

export function primaryLabel(chase: Chase): string | null {
  if (chase.stage === 'done') return null
  return PRIMARY[chase.stage]
}

export function primaryHint(chase: Chase): string | null {
  if (chase.stage === 'do_it' || chase.stage === 'confirm_sent') return 'Moves this to In progress'
  if (chase.stage === 'waiting' || chase.stage === 'confirm_back') return 'Marks this complete'
  return null
}

export function notYetLabel(chase: Chase): string | null {
  if (chase.stage === 'confirm_sent') return 'Still pending'
  if (chase.stage === 'confirm_back') return 'Still in progress'
  return null
}

export function statusWord(stage: Stage): string {
  if (stage === 'do_it' || stage === 'confirm_sent') return 'Pending'
  if (stage === 'waiting') return 'In progress'
  if (stage === 'confirm_back') return 'Due back'
  return 'Complete'
}

export function toneOf(stage: Stage): 'amber' | 'blue' | 'green' | 'neutral' {
  if (stage === 'do_it' || stage === 'confirm_sent') return 'amber'
  if (stage === 'waiting') return 'blue'
  if (stage === 'confirm_back') return 'green'
  return 'neutral'
}

export function stageIndex(stage: Stage): number {
  if (stage === 'do_it') return 0
  if (stage === 'confirm_sent') return 1
  if (stage === 'waiting') return 2
  if (stage === 'confirm_back') return 3
  return 4
}

function topOfHour(from: Date, hoursAhead: number): Date {
  const d = new Date(from.getTime() + hoursAhead * 60 * 60 * 1000)
  d.setMinutes(0, 0, 0)
  if (d.getTime() <= from.getTime()) d.setHours(d.getHours() + 1)
  return d
}

function morningOnOffset(from: Date, days: number, hour: number): Date {
  const d = new Date(from)
  d.setDate(d.getDate() + days)
  d.setHours(hour, 0, 0, 0)
  return d
}

export interface ChaseDraft {
  template: TemplateId
  title: string
  jobLabel: string
  doItAt: string | null
  confirmSentMode: ConfirmMode
  confirmSentDelayHours: number
  confirmSentAt: string | null
  waitingCheckAt: string | null
  expectedBackAt: string | null
  confirmBackRepeatHours: number
  morningHour: number
  stageLabels: [string, string, string, string] | null
}

export function defaultDraft(now: Date): ChaseDraft {
  const hour = 8
  return {
    template: 'blank',
    title: '',
    jobLabel: '',
    doItAt: topOfHour(now, 2).toISOString(),
    confirmSentMode: 'delay_hours',
    confirmSentDelayHours: 24,
    confirmSentAt: null,
    waitingCheckAt: null,
    expectedBackAt: morningOnOffset(now, 5, hour).toISOString(),
    confirmBackRepeatHours: 24,
    morningHour: hour,
    stageLabels: null,
  }
}
