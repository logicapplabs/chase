import { useState } from 'react'
import type { QuickTitle } from '@shared/types'
import type { SessionUser } from '../repository'

export function SettingsView({
  mode,
  user,
  message,
  titles,
  onEnable,
  onSignOut,
  onAddTitle,
  onRenameTitle,
  onRemoveTitle,
}: {
  mode: 'local' | 'cloud'
  user: SessionUser | null
  message: string | null
  titles: QuickTitle[] | null
  onEnable: () => void
  onSignOut: () => void
  onAddTitle: (label: string) => void
  onRenameTitle: (title: QuickTitle, label: string) => void
  onRemoveTitle: (id: string) => void
}) {
  const [draft, setDraft] = useState('')

  return (
    <>
      <section className="panel">
        <h2 className="title">Settings</h2>
        <p className="lede">
          {mode === 'cloud' && user
            ? `Signed in as ${user.email}. This list is shared with your other signed-in devices.`
            : 'On this device only. Add Supabase keys in .env.local when you want the phone and the PC to share one list.'}
        </p>
        <div className="actions">
          <button className="primary" type="button" onClick={onEnable}>
            Turn on reminders
          </button>
          {message && <p className="note">{message}</p>}
        </div>
        <p className="help">
          Install Chase from the browser menu on Windows. On Android, open it in Chrome and choose Add to Home screen.
          Reminders after you close the app come from the scheduler: npm run nudge, or the send-nudges function every few minutes.
        </p>
        {mode === 'cloud' && user && (
          <div className="footer-actions">
            <button className="danger" type="button" onClick={onSignOut}>
              Sign out
            </button>
          </div>
        )}
      </section>
      {titles && (
        <section className="panel" style={{ marginTop: '0.75rem' }}>
          <h2 className="title">Titles</h2>
          <p className="lede">Saved names show up as one tap when you add a chase.</p>
          <form
            className="title-add"
            onSubmit={(event) => {
              event.preventDefault()
              const label = draft.trim()
              if (!label) return
              onAddTitle(label)
              setDraft('')
            }}
          >
            <input
              value={draft}
              placeholder="Approval set"
              aria-label="New title"
              onChange={(event) => setDraft(event.target.value)}
            />
            <button className="ghost" type="submit" disabled={!draft.trim()}>
              Add
            </button>
          </form>
          {titles.length === 0 && <p className="help">No saved titles yet.</p>}
          <ul className="title-list">
            {titles.map((title) => (
              <li key={title.id}>
                <input
                  aria-label={`Rename ${title.label}`}
                  defaultValue={title.label}
                  onBlur={(event) => {
                    const label = event.target.value.trim()
                    if (!label) {
                      event.target.value = title.label
                      return
                    }
                    if (label !== title.label) onRenameTitle(title, label)
                  }}
                />
                <button className="danger" type="button" onClick={() => onRemoveTitle(title.id)}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="panel about" style={{ marginTop: '0.75rem' }}>
        <h2 className="title">About</h2>
        <p className="lede">Chase is owned by Logic App Labs, LLC.</p>
      </section>
    </>
  )
}
