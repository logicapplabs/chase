import { useState } from 'react'

export function AuthView({
  onSignIn,
  onSignUp,
}: {
  onSignIn: (email: string, password: string) => Promise<void>
  onSignUp: (email: string, password: string) => Promise<void>
}) {
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  return (
    <form
      className="panel"
      onSubmit={(event) => {
        event.preventDefault()
        setBusy(true)
        setError(null)
        const run = mode === 'in' ? onSignIn(email, password) : onSignUp(email, password)
        run.catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could not sign in.')).finally(() => setBusy(false))
      }}
    >
      <h2 className="title">{mode === 'in' ? 'Sign in' : 'Create account'}</h2>
      <p className="lede">One account keeps this list on your PC and your Android phone.</p>
      <div style={{ height: '1rem' }} />
      <label className="field">
        <span>Email</span>
        <input type="email" autoComplete="username" value={email} required onChange={(event) => setEmail(event.target.value)} />
      </label>
      <label className="field">
        <span>Password</span>
        <input
          type="password"
          autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
          value={password}
          required
          minLength={6}
          onChange={(event) => setPassword(event.target.value)}
        />
      </label>
      {error && <p className="banner">{error}</p>}
      <button className="primary" type="submit" disabled={busy}>
        {mode === 'in' ? 'Sign in' : 'Create account'}
      </button>
      <button className="ghost" type="button" style={{ width: '100%', marginTop: '0.6rem' }} onClick={() => setMode(mode === 'in' ? 'up' : 'in')}>
        {mode === 'in' ? 'Need an account?' : 'Already have an account?'}
      </button>
    </form>
  )
}
