import { useState } from 'react'
import { newChase } from '@shared/schedule'
import { defaultDraft, type ChaseDraft } from '@shared/templates'
import type { Chase, QuickTitle } from '@shared/types'
import { TimingFields } from './TimingFields'

export function NewChase({
  titles,
  onCreate,
}: {
  titles: QuickTitle[]
  onCreate: (chase: Chase) => void
}) {
  const [draft, setDraft] = useState<ChaseDraft>(() => defaultDraft(new Date()))

  return (
    <form
      className="panel"
      onSubmit={(event) => {
        event.preventDefault()
        if (!draft.title.trim()) return
        onCreate(newChase({ ...draft, now: new Date() }))
      }}
    >
      {titles.length > 0 && (
        <div className="chips" role="listbox" aria-label="Saved titles">
          {titles.map((title) => (
            <button
              key={title.id}
              type="button"
              className="chip"
              aria-pressed={draft.title === title.label}
              onClick={() => setDraft({ ...draft, title: title.label })}
            >
              {title.label}
            </button>
          ))}
        </div>
      )}
      <div style={{ height: titles.length > 0 ? '1rem' : 0 }} />
      <TimingFields draft={draft} onChange={setDraft} />
      <button className="primary" type="submit" disabled={!draft.title.trim()}>
        Add chase
      </button>
    </form>
  )
}
