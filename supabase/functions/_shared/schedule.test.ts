import { describe, expect, it } from 'vitest'
import { formatWhen } from './format.ts'
import {
  confirmSentDeadline,
  glance,
  markStageDone,
  newChase,
  sayNotYet,
  snoozeToMorning,
  tick,
  upcoming,
} from './schedule.ts'
import { defaultDraft } from './templates.ts'

function at(y: number, m: number, d: number, h: number, min = 0): Date {
  return new Date(y, m - 1, d, h, min, 0, 0)
}

function chaseAt(now: Date, doIt: Date, back: Date) {
  const draft = defaultDraft(now)
  return newChase({
    ...draft,
    template: 'signature',
    confirmSentMode: 'next_morning',
    confirmSentAt: null,
    title: 'Approval set',
    jobLabel: 'Smith barn',
    doItAt: doIt.toISOString(),
    expectedBackAt: back.toISOString(),
    waitingCheckAt: null,
    now,
    id: 'c1',
  })
}

describe('signature chase', () => {
  const created = at(2026, 10, 12, 13, 0)
  const doIt = at(2026, 10, 12, 15, 0)
  const back = at(2026, 10, 17, 8, 0)

  it('reminds you to send it, then asks the next morning if you have not', () => {
    const chase = chaseAt(created, doIt, back)
    expect(chase.stage).toBe('do_it')
    expect(new Date(chase.nextNudgeAt!).getTime()).toBe(doIt.getTime())
    expect(glance(chase, created)).toMatch(/^Send it · /)

    const deadline = confirmSentDeadline(chase)!
    expect(deadline.getTime()).toBe(at(2026, 10, 13, 8, 0).getTime())

    const first = tick(chase, doIt)
    expect(first.nudge?.title).toBe('Send it')
    expect(first.chase.stage).toBe('do_it')
    const again = tick(first.chase, new Date(doIt.getTime() + 60_000))
    expect(again.nudge).toBeNull()

    const confirm = tick(again.chase, deadline)
    expect(confirm.chase.stage).toBe('confirm_sent')
    expect(confirm.nudge?.title).toBe('Ask if you sent it')
    expect(glance(confirm.chase, deadline)).toBe('Still unchecked')
    expect(tick(confirm.chase, new Date(deadline.getTime() + 60_000)).nudge).toBeNull()
  })

  it('moves to Out when you mark it sent, and does not ask again', () => {
    const chase = chaseAt(created, doIt, back)
    const sent = markStageDone(chase, at(2026, 10, 12, 15, 5))
    expect(sent.stage).toBe('waiting')
    expect(glance(sent, at(2026, 10, 12, 15, 5))).toMatch(/^Ask if it came back · /)
    const later = tick(sent, at(2026, 10, 13, 8, 0))
    expect(later.chase.stage).toBe('waiting')
    expect(later.nudge).toBeNull()
  })

  it('asks every day after the expected return until you check it off', () => {
    let chase = markStageDone(chaseAt(created, doIt, back), at(2026, 10, 12, 16, 0))
    const due = tick(chase, back)
    expect(due.chase.stage).toBe('confirm_back')
    expect(due.nudge?.title).toBe('Ask if it came back')
    expect(tick(due.chase, new Date(back.getTime() + 60_000)).nudge).toBeNull()

    const nextDay = at(2026, 10, 18, 8, 0)
    const repeat = tick(due.chase, nextDay)
    expect(repeat.nudge?.stage).toBe('confirm_back')
    expect(new Date(repeat.chase.nextNudgeAt!).getTime()).toBe(at(2026, 10, 19, 8, 0).getTime())

    const done = markStageDone(repeat.chase, nextDay)
    expect(done.stage).toBe('done')
    expect(done.nextNudgeAt).toBeNull()
    expect(tick(done, at(2026, 10, 20, 8, 0)).nudge).toBeNull()
  })

  it('sends you back a stage when it is not done yet', () => {
    const chase = chaseAt(created, doIt, back)
    const asked = tick(tick(chase, doIt).chase, at(2026, 10, 13, 8, 0)).chase
    const notYet = sayNotYet(asked, at(2026, 10, 13, 9, 0))
    expect(notYet.stage).toBe('do_it')
    expect(new Date(notYet.doItAt!).getTime()).toBe(at(2026, 10, 13, 10, 0).getTime())

    const waiting = markStageDone(notYet, at(2026, 10, 13, 11, 0))
    const returned = tick(waiting, back).chase
    const stillOut = sayNotYet(returned, at(2026, 10, 17, 9, 0))
    expect(stillOut.stage).toBe('waiting')
    expect(new Date(stillOut.expectedBackAt!).getTime()).toBe(at(2026, 10, 18, 9, 0).getTime())
  })

  it('snoozes until the next morning and can ask again', () => {
    const fired = tick(chaseAt(created, doIt, back), doIt).chase
    const snoozed = snoozeToMorning(fired, at(2026, 10, 12, 15, 10))
    expect(glance(snoozed, at(2026, 10, 12, 15, 10))).toMatch(/^Snoozed · tomorrow/)
    expect(tick(snoozed, at(2026, 10, 12, 18, 0)).nudge).toBeNull()
    const morning = tick(snoozed, at(2026, 10, 13, 8, 0))
    expect(morning.nudge).not.toBeNull()
  })

  it('lists the chain of upcoming nudges', () => {
    const chase = chaseAt(created, doIt, back)
    const labels = upcoming(chase, created).map((item) => item.label)
    expect(labels).toEqual(['Send it', 'Ask if you sent it', 'Ask if it came back'])
  })
})

describe('light check', () => {
  it('fires once while a chase is out', () => {
    const now = at(2026, 10, 12, 9, 0)
    const checkAt = at(2026, 10, 15, 8, 0)
    let chase = newChase({
      ...defaultDraft(now),
      title: 'Approval set',
      jobLabel: 'Smith barn',
      waitingCheckAt: checkAt.toISOString(),
      expectedBackAt: at(2026, 10, 19, 8, 0).toISOString(),
      now,
      id: 'r1',
    })
    chase = markStageDone(chase, at(2026, 10, 12, 11, 0))
    expect(chase.stage).toBe('waiting')
    const check = tick(chase, checkAt)
    expect(check.nudge?.title).toBe('Light check')
    expect(check.chase.stage).toBe('waiting')
    expect(tick(check.chase, new Date(checkAt.getTime() + 60_000)).nudge).toBeNull()
  })
})

describe('formatWhen', () => {
  it('says now, a clock time, or tomorrow', () => {
    const now = at(2026, 10, 12, 15, 0)
    expect(formatWhen(at(2026, 10, 12, 14, 0), now)).toBe('now')
    expect(formatWhen(at(2026, 10, 12, 18, 30), now)).toMatch(/6:30/)
    expect(formatWhen(at(2026, 10, 13, 8, 0), now)).toMatch(/^tomorrow /)
  })
})
