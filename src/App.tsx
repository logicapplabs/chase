import { useEffect, useMemo, useRef, useState } from 'react'
import { markStageDone, sayNotYet, scheduleSignature, snoozeToMorning, tick } from '@shared/schedule'
import type { Chase, QuickTitle } from '@shared/types'
import { AuthView } from './components/AuthView'
import { DetailView } from './components/DetailView'
import { ListView } from './components/ListView'
import { NewChase } from './components/NewChase'
import { SettingsView } from './components/SettingsView'
import { enableReminders, showLocalNudge } from './notify'
import { createRepository, type SessionUser } from './repository'

type Route = { name: 'list' } | { name: 'new' } | { name: 'chase'; id: string } | { name: 'settings' }

function parseHash(hash: string): Route {
  const parts = hash.replace(/^#/, '').split('/').filter(Boolean)
  if (parts[0] === 'new') return { name: 'new' }
  if (parts[0] === 'chase' && parts[1]) return { name: 'chase', id: decodeURIComponent(parts[1]) }
  if (parts[0] === 'settings') return { name: 'settings' }
  return { name: 'list' }
}

function useHash(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash))
  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash))
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}

export function App() {
  const repo = useMemo(() => createRepository(), [])
  const route = useHash()
  const [now, setNow] = useState(() => new Date())
  const [chases, setChases] = useState<Chase[]>([])
  const [titles, setTitles] = useState<QuickTitle[]>([])
  const [user, setUser] = useState<SessionUser | null>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [confirmNote, setConfirmNote] = useState<string | null>(null)
  const seen = useRef(new Set<string>())

  useEffect(() => {
    const clock = setInterval(() => setNow(new Date()), 30_000)
    const onVisible = () => {
      if (document.visibilityState === 'visible') setNow(new Date())
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(clock)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  useEffect(() => {
    let stop = false
    const boot = async () => {
      try {
        const current = await repo.currentUser()
        if (stop) return
        setUser(current)
        if (repo.mode === 'local' || current) {
          setChases(await repo.list())
          setTitles(await repo.listTitles())
        } else {
          setChases([])
          setTitles([])
        }
        setError(null)
      } catch (err) {
        if (!stop) setError(err instanceof Error ? err.message : 'Could not load chases.')
      } finally {
        if (!stop) setReady(true)
      }
    }
    void boot()
    const offAuth = repo.onAuth(() => void boot())
    const offData = repo.subscribe(() => {
      void repo.list().then(setChases).catch(() => {})
      void repo.listTitles().then(setTitles).catch(() => {})
    })
    return () => {
      stop = true
      offAuth()
      offData()
    }
  }, [repo])

  useEffect(() => {
    if (!ready || (repo.mode === 'cloud' && !user)) return
    let cancel = false
    for (const chase of chases) {
      const result = tick(chase, now)
      if (result.nudge) {
        const token = `${chase.id}:${result.nudge.key}`
        if (!seen.current.has(token)) {
          seen.current.add(token)
          showLocalNudge(result.nudge, chase.id)
        }
      }
      if (scheduleSignature(chase) !== scheduleSignature(result.chase)) {
        void repo.save(result.chase).then(() => {
          if (cancel) return
          setChases((prev) => prev.map((item) => (item.id === result.chase.id ? result.chase : item)))
        }).catch((err: unknown) => {
          if (!cancel) setError(err instanceof Error ? err.message : 'Could not save a reminder.')
        })
      }
    }
    return () => {
      cancel = true
    }
  }, [chases, now, ready, repo, user])

  async function commit(next: Chase) {
    setChases((prev) => {
      const exists = prev.some((item) => item.id === next.id)
      return exists ? prev.map((item) => (item.id === next.id ? next : item)) : [next, ...prev]
    })
    await repo.save(next)
  }

  const projected = chases.map((chase) => tick(chase, now).chase)
  const selected = route.name === 'chase' ? projected.find((chase) => chase.id === route.id) : undefined

  async function turnOnReminders() {
    try {
      const message = await enableReminders((json) => repo.saveSubscription(json), repo.mode === 'cloud')
      setNotice(message)
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Could not turn on reminders.')
    }
  }

  return (
    <main className="wrap">
      <header className="top">
        <a className="brand" href="#/">
          Chase
          <span>PEMB follow-through</span>
        </a>
        <nav className="nav">
          {route.name === 'list' && (repo.mode === 'local' || user) && (
            <a className="text-btn" href="#/new">
              New
            </a>
          )}
          <a className="text-btn" href="#/settings">
            Settings
          </a>
        </nav>
      </header>
      {error && <p className="banner">{error}</p>}
      {!ready && <p className="loading">Loading…</p>}
      {ready && repo.mode === 'cloud' && !user && route.name !== 'settings' && (
        <>
          {confirmNote && <p className="banner">{confirmNote}</p>}
          <AuthView
            onSignIn={async (email, password) => {
              await repo.signIn(email, password)
            }}
            onSignUp={async (email, password) => {
              const result = await repo.signUp(email, password)
              if (result === 'confirm-email') setConfirmNote('Check your email to confirm the account, then sign in.')
            }}
          />
        </>
      )}
      {ready && (repo.mode === 'local' || user) && route.name === 'list' && (
        <ListView chases={projected} now={now} onEnable={() => void turnOnReminders()} />
      )}
      {ready && (repo.mode === 'local' || user) && route.name === 'new' && (
        <>
          <a className="back" href="#/">
            Back
          </a>
          <NewChase
            titles={titles}
            onCreate={(chase) => {
              void commit({ ...chase, userId: user?.id ?? 'local' })
                .then(() => {
                  window.location.hash = '#/'
                })
                .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could not add that chase.'))
            }}
          />
        </>
      )}
      {ready && (repo.mode === 'local' || user) && route.name === 'chase' && (
        <>
          <a className="back" href="#/">
            Back
          </a>
          {selected ? (
            <DetailView
              key={selected.id}
              chase={selected}
              now={now}
              onDone={() => void commit(markStageDone(selected, now)).catch((err: unknown) => setError(messageOf(err)))}
              onNotYet={() => void commit(sayNotYet(selected, now)).catch((err: unknown) => setError(messageOf(err)))}
              onSnooze={() => void commit(snoozeToMorning(selected, now)).catch((err: unknown) => setError(messageOf(err)))}
              onSave={(next) => void commit(next).catch((err: unknown) => setError(messageOf(err)))}
              onDelete={() => {
                setChases((prev) => prev.filter((item) => item.id !== selected.id))
                void repo
                  .remove(selected.id)
                  .then(() => {
                    window.location.hash = '#/'
                  })
                  .catch((err: unknown) => setError(messageOf(err)))
              }}
            />
          ) : (
            <p className="lede">That chase is not on this list.</p>
          )}
        </>
      )}
      {ready && route.name === 'settings' && (
        <>
          <a className="back" href="#/">
            Back
          </a>
          <SettingsView
            mode={repo.mode}
            user={user}
            message={notice}
            titles={repo.mode === 'local' || user ? titles : null}
            onEnable={() => void turnOnReminders()}
            onSignOut={() => {
              void repo.signOut().catch((err: unknown) => setError(messageOf(err)))
            }}
            onAddTitle={(label) => {
              const title: QuickTitle = {
                id: crypto.randomUUID(),
                userId: user?.id ?? 'local',
                label,
                position: titles.length,
              }
              setTitles((prev) => [...prev, title])
              void repo.saveTitle(title).catch((err: unknown) => setError(messageOf(err)))
            }}
            onRenameTitle={(title, label) => {
              const next = { ...title, label }
              setTitles((prev) => prev.map((item) => (item.id === title.id ? next : item)))
              void repo.saveTitle(next).catch((err: unknown) => setError(messageOf(err)))
            }}
            onRemoveTitle={(id) => {
              setTitles((prev) => prev.filter((item) => item.id !== id))
              void repo.removeTitle(id).catch((err: unknown) => setError(messageOf(err)))
            }}
          />
        </>
      )}
    </main>
  )
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : 'Something went wrong.'
}
