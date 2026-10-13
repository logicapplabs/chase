import { useState } from 'react'
import { formatWhen } from '@shared/format'
import { applyTiming, glance, upcoming } from '@shared/schedule'
import {
  notYetLabel,
  primaryHint,
  primaryLabel,
  segmentLabels,
  statusWord,
  toneOf,
  type ChaseDraft,
} from '@shared/templates'
import type { Chase } from '@shared/types'
import { StageBar } from './StageBar'
import { TimingFields } from './TimingFields'

function toDraft(chase: Chase): ChaseDraft {
  return {
    template: chase.template,
    title: chase.title,
    jobLabel: chase.jobLabel,
    doItAt: chase.doItAt,
    confirmSentMode: chase.confirmSentMode,
    confirmSentDelayHours: chase.confirmSentDelayHours,
    confirmSentAt: chase.confirmSentAt ?? null,
    waitingCheckAt: chase.waitingCheckAt,
    expectedBackAt: chase.expectedBackAt,
    confirmBackRepeatHours: chase.confirmBackRepeatHours,
    morningHour: chase.morningHour,
    stageLabels: chase.stageLabels,
  }
}

export function DetailView({
  chase,
  now,
  onDone,
  onNotYet,
  onSnooze,
  onSave,
  onDelete,
}: {
  chase: Chase
  now: Date
  onDone: () => void
  onNotYet: () => void
  onSnooze: () => void
  onSave: (chase: Chase) => void
  onDelete: () => void
}) {
  const [draft, setDraft] = useState(() => toDraft(chase))
  const [editing, setEditing] = useState(false)
  const labels = segmentLabels(chase)
  const primary = primaryLabel(chase)
  const notYet = notYetLabel(chase)
  const events = upcoming(chase, now)
  const hour = chase.morningHour

  return (
    <article className={`panel tone-${toneOf(chase.stage)}`}>
      {chase.jobLabel && <p className="job">{chase.jobLabel}</p>}
      <div className="row-top">
        <h2 className="title">{chase.title}</h2>
        <span className="status">{statusWord(chase.stage)}</span>
      </div>
      <StageBar stage={chase.stage} labels={labels} labelled />
      <p className="glance">{glance(chase, now) ?? 'Reminders stopped'}</p>
      {primary && (
        <div className="actions">
          <button className="primary" type="button" onClick={onDone}>
            {primary}
          </button>
          <p className="hint">{primaryHint(chase)}</p>
          <div className="secondary">
            {notYet && (
              <button className="ghost" type="button" onClick={onNotYet}>
                {notYet}
              </button>
            )}
            <button className="ghost" type="button" onClick={onSnooze}>
              Snooze until tomorrow {hour}:00
            </button>
          </div>
        </div>
      )}
      {events.length > 0 && (
        <ul className="timeline">
          {events.map((event) => (
            <li key={`${event.label}-${event.at}`}>
              <span>{event.label}</span>
              <time dateTime={event.at}>{formatWhen(new Date(event.at), now)}</time>
            </li>
          ))}
        </ul>
      )}
      {!editing && (
        <div className="secondary">
          <button
            className="ghost"
            type="button"
            onClick={() => {
              setDraft(toDraft(chase))
              setEditing(true)
            }}
          >
            Edit
          </button>
        </div>
      )}
      {editing && chase.stage !== 'done' && (
        <div className="timing">
          <TimingFields draft={draft} onChange={setDraft} />
          <div className="secondary">
            <button className="ghost" type="button" onClick={() => setEditing(false)}>
              Cancel
            </button>
            <button
              className="primary"
              type="button"
              disabled={!draft.title.trim()}
              onClick={() => {
                onSave(applyTiming(chase, draft, now))
                setEditing(false)
              }}
            >
              Save
            </button>
          </div>
        </div>
      )}
      {editing && chase.stage === 'done' && (
        <div className="timing">
          <label className="field">
            <span>Title</span>
            <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
          </label>
          <label className="field">
            <span>Job</span>
            <input value={draft.jobLabel} onChange={(event) => setDraft({ ...draft, jobLabel: event.target.value })} />
          </label>
          <div className="secondary">
            <button className="ghost" type="button" onClick={() => setEditing(false)}>
              Cancel
            </button>
            <button
              className="primary"
              type="button"
              disabled={!draft.title.trim()}
              onClick={() => {
                onSave(applyTiming(chase, { ...toDraft(chase), title: draft.title, jobLabel: draft.jobLabel }, now))
                setEditing(false)
              }}
            >
              Save
            </button>
          </div>
        </div>
      )}
      <div className="footer-actions">
        <button
          className="danger"
          type="button"
          onClick={() => {
            if (window.confirm('Delete this chase?')) onDelete()
          }}
        >
          Delete
        </button>
      </div>
    </article>
  )
}
