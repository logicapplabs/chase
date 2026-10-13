export const STAGES = ['do_it', 'confirm_sent', 'waiting', 'confirm_back', 'done'] as const
export type Stage = (typeof STAGES)[number]

export const TEMPLATE_IDS = ['signature', 'mail', 'redlines', 'blank'] as const
export type TemplateId = (typeof TEMPLATE_IDS)[number]

export type ConfirmMode = 'next_morning' | 'delay_hours' | 'at'

export interface Chase {
  id: string
  userId: string
  title: string
  jobLabel: string
  template: TemplateId
  stageLabels: [string, string, string, string] | null
  stage: Stage
  stageEnteredAt: string
  doItAt: string | null
  confirmSentMode: ConfirmMode
  confirmSentDelayHours: number
  confirmSentAt: string | null
  morningHour: number
  waitingCheckAt: string | null
  expectedBackAt: string | null
  confirmBackRepeatHours: number
  snoozeUntil: string | null
  lastNudgeKey: string | null
  waitingCheckFired: boolean
  nextNudgeAt: string | null
  createdAt: string
  updatedAt: string
}

export interface Nudge {
  key: string
  stage: Stage
  title: string
  body: string
}

export interface PushSub {
  id: string
  endpoint: string
  p256dh: string
  auth: string
}

export interface QuickTitle {
  id: string
  userId: string
  label: string
  position: number
}

export interface PushPayload {
  title: string
  body: string
  url: string
  tag: string
}
