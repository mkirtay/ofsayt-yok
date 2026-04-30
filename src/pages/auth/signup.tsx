import { useEffect, useMemo, useState, FormEvent } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import Head from 'next/head'
import { validatePassword } from '@/lib/validation'
import styles from './auth.module.scss'

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: string | HTMLElement,
        options: {
          sitekey: string
          callback: (token: string) => void
          'expired-callback'?: () => void
          'error-callback'?: () => void
        },
      ) => string
      reset: (widgetId?: string) => void
    }
  }
}

export default function SignUpPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [turnstileToken, setTurnstileToken] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || ''
  const turnstileRequired =
    process.env.NODE_ENV === 'production' && Boolean(turnstileSiteKey)

  const pwCheck = useMemo(() => validatePassword(password), [password])
  const pwTouched = password.length > 0

  useEffect(() => {
    if (!turnstileSiteKey) return

    const scriptId = 'cf-turnstile-script'
    if (!document.getElementById(scriptId)) {
      const s = document.createElement('script')
      s.id = scriptId
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
      s.async = true
      s.defer = true
      document.head.appendChild(s)
    }

    const mount = () => {
      if (!window.turnstile) return
      const el = document.getElementById('turnstile-container')
      if (!el || el.childNodes.length > 0) return
      window.turnstile.render(el, {
        sitekey: turnstileSiteKey,
        callback: (token) => setTurnstileToken(token),
        'expired-callback': () => setTurnstileToken(''),
        'error-callback': () => setTurnstileToken(''),
      })
    }

    const timer = window.setInterval(mount, 300)
    return () => window.clearInterval(timer)
  }, [turnstileSiteKey])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')

    if (turnstileRequired && !turnstileToken) {
      setError('Lutfen guvenlik dogrulamasini tamamlayin.')
      return
    }

    setLoading(true)

    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        username: username.trim() || undefined,
        email,
        password,
        turnstileToken,
      }),
    })

    const data = await res.json()

    if (!res.ok) {
      setError(data.error || 'Kayıt başarısız')
      setLoading(false)
      return
    }

    const result = await signIn('credentials', {
      redirect: false,
      email,
      password,
    })

    setLoading(false)

    if (result?.error) {
      setError('Kayıt başarılı ama giriş yapılamadı. Lütfen giriş sayfasını deneyin.')
      return
    }

    router.push('/')

    if (window.turnstile) window.turnstile.reset()
    setTurnstileToken('')
  }

  return (
    <>
      <Head>
        <title>Üye Ol — Ofsayt Yok</title>
      </Head>
      <div className={styles.wrapper}>
        <form className={styles.card} onSubmit={handleSubmit}>
          <h1 className={styles.title}>Üye Ol</h1>

          {error && <p className={styles.error}>{error}</p>}

          <label className={styles.label}>
            İsim
            <input
              className={styles.input}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
            />
          </label>

          <label className={styles.label}>
            Kullanıcı adı (isteğe bağlı)
            <input
              className={styles.input}
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="ör. muco_1907"
              maxLength={30}
              autoComplete="username"
            />
          </label>

          <label className={styles.label}>
            E-posta
            <input
              className={styles.input}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </label>

          <label className={styles.label}>
            Şifre
            <input
              className={styles.input}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={10}
              autoComplete="new-password"
            />
            {pwTouched && (
              <ul className={styles.ruleList}>
                {pwCheck.results.map((r) => (
                  <li
                    key={r.key}
                    className={r.passed ? styles.rulePassed : styles.ruleFailed}
                  >
                    <span className={styles.ruleIcon}>{r.passed ? '✓' : '✗'}</span>
                    {r.label}
                  </li>
                ))}
              </ul>
            )}
          </label>

          {turnstileRequired ? <div id="turnstile-container" /> : null}
          {turnstileRequired && !turnstileToken ? (
            <p className={styles.footer}>Kayit icin once guvenlik dogrulamasini tamamlayin.</p>
          ) : null}

          <button
            className={styles.submit}
            type="submit"
            disabled={loading || !pwCheck.valid || (turnstileRequired && !turnstileToken)}
          >
            {loading ? 'Kayıt yapılıyor…' : 'Üye Ol'}
          </button>

          <p className={styles.footer}>
            Zaten hesabın var mı?{' '}
            <Link href="/auth/signin" className={styles.link}>
              Giriş Yap
            </Link>
          </p>
        </form>
      </div>
    </>
  )
}
