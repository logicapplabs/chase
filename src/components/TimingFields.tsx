import { useState } from 'react'
import { fromLocalInput, toDateInput, toLocalInput, fromDateInput } from '@shared/format'
import { nextMorningAfter } from '@shared/schedule'
import type { ChaseDraft } from '@shared/templates'

type Unit = 'hours' | 'days'
type PickMode = 'amount' | 'at'

function splitHours(hours: number): { amount: number; unit: Unit } {
  if (hours >= 24 && hours % 24 === 0) return { amount: hours / 24, unit: 'days' }
  return { amount: Math.max(1, hours), unit: 'hours' }
}

function joinHours(amount: number, unit: Unit): number {
  const count = Math.max(1, Math.round(amount) || 1)
  return unit === 'days' ? count * 24 : count
}

function uncheckedMoment(draft: ChaseDraft): string {
  if (draft.confirmSentAt) return draft.confirmSentAt
  const anchor = new Date(draft.doItAt ?? Date.now())
  if (draft.confirmSentMode === 'delay_hours') {
    return new Date(anchor.getTime() + Math.max(1, draft.confirmSentDelayHours) * 60 * 60 * 1000).toISOString()
  }
  return nextMorningAfter(anchor, draft.morningHour).toISOString()
}

function PickSwitch({
  value,
  onChange,
}: {
  value: PickMode
  onChange: (value: PickMode) => void
}) {
  return (
    <div className="chips" role="group">
      <button type="button" className="chip" aria-pressed={value === 'amount'} onClick={() => onChange('amount')}>
        Amount of time
      </button>
      <button type="button" className="chip" aria-pressed={value === 'at'} onClick={() => onChange('at')}>
        Date and time
      </button>
    </div>
  )
}

function AmountControl({
  hours,
  onHours,
}: {
  hours: number
  onHours: (hours: number) => void
}) {
  const parts = splitHours(hours)
  return (
    <div className="when-row">
      <input
        type="number"
        min={1}
        aria-label="Amount"
        value={parts.amount}
        onChange={(event) => onHours(joinHours(Number(event.target.value), parts.unit))}
      />
      <select
        aria-label="Unit"
        value={parts.unit}
        onChange={(event) => onHours(joinHours(parts.amount, event.target.value as Unit))}
      >
        <option value="hours">hours</option>
        <option value="days">days</option>
      </select>
    </div>
  )
}

export function TimingFields({
  draft,
  onChange,
  names,
}: {
  draft: ChaseDraft
  onChange: (draft: ChaseDraft) => void
  names?: boolean
}) {
  const [uncheckedPick, setUncheckedPick] = useState<PickMode>(draft.confirmSentMode === 'delay_hours' ? 'amount' : 'at')
  const [repeatPick, setRepeatPick] = useState<PickMode>('amount')

  return (
    <>
      <label className="field">
        <span>Title</span>
        <input
          value={draft.title}
          placeholder="Approval set"
          onChange={(event) => onChange({ ...draft, title: event.target.value })}
        />
      </label>
      <label className="field">
        <span>Job</span>
        <input
          value={draft.jobLabel}
          placeholder="Smith barn"
          onChange={(event) => onChange({ ...draft, jobLabel: event.target.value })}
        />
      </label>
      <label className="field">
        <span>Remind me to do it</span>
        <input
          type="datetime-local"
          value={toLocalInput(draft.doItAt)}
          onChange={(event) => onChange({ ...draft, doItAt: fromLocalInput(event.target.value) })}
        />
      </label>
      <div className="field">
        <span className="label">If it is still unchecked</span>
        <PickSwitch
          value={uncheckedPick}
          onChange={(pick) => {
            setUncheckedPick(pick)
            if (pick === 'amount') onChange({ ...draft, confirmSentMode: 'delay_hours', confirmSentAt: null })
            else onChange({ ...draft, confirmSentMode: 'at', confirmSentAt: uncheckedMoment(draft) })
          }}
        />
        {uncheckedPick === 'amount' ? (
          <AmountControl
            hours={draft.confirmSentDelayHours}
            onHours={(hours) => onChange({ ...draft, confirmSentMode: 'delay_hours', confirmSentDelayHours: hours, confirmSentAt: null })}
          />
        ) : (
          <input
            type="datetime-local"
            aria-label="Unchecked at"
            value={toLocalInput(uncheckedMoment(draft))}
            onChange={(event) =>
              onChange({ ...draft, confirmSentMode: 'at', confirmSentAt: fromLocalInput(event.target.value) })
            }
          />
        )}
      </div>
      <label className="field">
        <span>Light check while it is out</span>
        <input
          type="date"
          value={toDateInput(draft.waitingCheckAt)}
          onChange={(event) =>
            onChange({ ...draft, waitingCheckAt: fromDateInput(event.target.value, draft.morningHour) })
          }
        />
        <p className="help">Leave blank to stay quiet until it should be back.</p>
      </label>
      <label className="field">
        <span>Expected back</span>
        <input
          type="date"
          value={toDateInput(draft.expectedBackAt)}
          onChange={(event) =>
            onChange({ ...draft, expectedBackAt: fromDateInput(event.target.value, draft.morningHour) })
          }
        />
      </label>
      <div className="field">
        <span className="label">After it should be back, ask again</span>
        <PickSwitch
          value={repeatPick}
          onChange={(pick) => {
            setRepeatPick(pick)
            if (pick === 'at' && !draft.expectedBackAt) {
              onChange({ ...draft, expectedBackAt: new Date().toISOString() })
            }
          }}
        />
        {repeatPick === 'at' && (
          <input
            type="datetime-local"
            aria-label="Ask again at"
            value={toLocalInput(draft.expectedBackAt)}
            onChange={(event) => onChange({ ...draft, expectedBackAt: fromLocalInput(event.target.value) })}
          />
        )}
        <p className="help">{repeatPick === 'at' ? 'Then every' : 'How often to ask'}</p>
        <AmountControl
          hours={draft.confirmBackRepeatHours}
          onHours={(hours) => onChange({ ...draft, confirmBackRepeatHours: hours })}
        />
      </div>
      {names && draft.stageLabels && (
        <div className="field">
          <span className="label">Stage names</span>
          {draft.stageLabels.map((label, index) => (
            <input
              key={index}
              value={label}
              style={{ marginTop: index === 0 ? 0 : '0.4rem' }}
              onChange={(event) => {
                const stageLabels = [...draft.stageLabels!] as [string, string, string, string]
                stageLabels[index] = event.target.value
                onChange({ ...draft, stageLabels })
              }}
            />
          ))}
        </div>
      )}
    </>
  )
}
