import { useState } from 'react'
import { glance } from '@shared/schedule'
import { segmentLabels, statusWord, toneOf } from '@shared/templates'
import type { Chase } from '@shared/types'
import { StageBar } from './StageBar'

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'move', label: 'Pending' },
  { id: 'out', label: 'In progress' },
  { id: 'back', label: 'Due back' },
] as const

type FilterId = (typeof FILTERS)[number]['id']

function matches(chase: Chase, filter: FilterId) {
  if (filter === 'move') return chase.stage === 'do_it' || chase.stage === 'confirm_sent'
  if (filter === 'out') return chase.stage === 'waiting'
  if (filter === 'back') return chase.stage === 'confirm_back'
  return chase.stage !== 'done'
}

function rank(chase: Chase) {
  if (chase.stage === 'do_it' || chase.stage === 'confirm_sent') return 0
  if (chase.stage === 'confirm_back') return 1
  if (chase.stage === 'waiting') return 2
  return 3
}

export function ListView({ chases, now, onEnable }: { chases: Chase[]; now: Date; onEnable: () => void }) {
  const [filter, setFilter] = useState<FilterId>('all')
  const open = chases
    .filter((chase) => chase.stage !== 'done')
    .sort((a, b) => {
      const byRank = rank(a) - rank(b)
      if (byRank !== 0) return byRank
      const aTime = a.nextNudgeAt ? new Date(a.nextNudgeAt).getTime() : Number.POSITIVE_INFINITY
      const bTime = b.nextNudgeAt ? new Date(b.nextNudgeAt).getTime() : Number.POSITIVE_INFINITY
      return aTime - bTime
    })
  const done = chases.filter((chase) => chase.stage === 'done')
  const visible = filter === 'all' ? open : open.filter((chase) => matches(chase, filter))
  const counts = {
    move: open.filter((chase) => matches(chase, 'move')).length,
    out: open.filter((chase) => matches(chase, 'out')).length,
    back: open.filter((chase) => matches(chase, 'back')).length,
  }
  const permission = typeof Notification === 'undefined' ? 'unsupported' : Notification.permission

  return (
    <>
      {permission === 'default' && chases.length > 0 && (
        <button className="banner" type="button" onClick={onEnable}>
          Turn on reminders for this device
        </button>
      )}
      <div className="filters" role="toolbar" aria-label="Filter chases">
        {FILTERS.map((item) => (
          <button key={item.id} type="button" aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>
            {item.label}
            {item.id !== 'all' && counts[item.id] > 0 && <span className="count">{counts[item.id]}</span>}
          </button>
        ))}
      </div>
      {visible.length === 0 && (
        <div className="empty">
          <h2 className="title">{open.length === 0 ? 'Nothing out right now' : 'Nothing in this stage'}</h2>
          <p>Each chase keeps its own reminders.</p>
          {open.length === 0 && (
            <div className="chips">
              <a className="chip" href="#/new">
                New chase
              </a>
            </div>
          )}
        </div>
      )}
      {visible.map((chase) => (
        <a key={chase.id} className="row" href={`#/chase/${chase.id}`}>
          <div className="row-top">
            <div>
              {chase.jobLabel && <p className="job">{chase.jobLabel}</p>}
              <h2 className="title">{chase.title}</h2>
            </div>
            <span className={`status tone-${toneOf(chase.stage)}`}>{statusWord(chase.stage)}</span>
          </div>
          <StageBar stage={chase.stage} labels={segmentLabels(chase)} />
          <p className="glance">{glance(chase, now)}</p>
        </a>
      ))}
      {filter === 'all' && done.length > 0 && (
        <details className="group">
          <summary>Complete · {done.length}</summary>
          {done.map((chase) => (
            <a key={chase.id} className="row" href={`#/chase/${chase.id}`}>
              <div className="row-top">
                <h2 className="title">{chase.title}</h2>
                <span className="status tone-neutral">Complete</span>
              </div>
              <StageBar stage="done" labels={segmentLabels(chase)} />
            </a>
          ))}
        </details>
      )}
    </>
  )
}
