import { useState, useMemo, FormEvent } from 'react'
import { useRouter } from 'next/router'
import { signIn } from 'next-auth/react'
import Link from 'next/link'
import Head from 'next/head'
import { validatePassword } from '@/lib/validation'
import styles from './auth.module.scss'

export default function ResetPasswordPage() {
  const router = useRouter()
  const token = typeof router.query.token === 'string' ? router.query.token : ''

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const pwCheck = useMemo(() => validatePassword(password), [password])
  const pwTouched = password.length > 0
  const confirmMismatch = confirm.length > 0 && confirm !== password

  const canSubmit = pwCheck.valid && confirm === password && confirm.length > 0 && Boolean(token)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')

    if (!token) {
      setError('Geçersiz sıfırlama bağlantısı. Lütfen tekrar şifremi unuttum adımını deneyin.')
      return
    }

    setLoading(true)
    const res = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password }),
    })
    const data = await res.json()
    setLoading(false)

    if (!res.ok) {
      setError(data.error || 'Bir hata oluştu. Lütfen tekrar deneyin.')
      return
    }

    setDone(true)

    const loginResult = await signIn('credentials', {
      redirect: false,
      identifier: data.email,
      password,
    })

    if (loginResult?.ok) {
      router.push('/')
    } else {
      router.push('/auth/signin?reset=1')
    }
  }

  if (!token && router.isReady) {
    return (
      <>
        <Head>
          <title>Şifre Sıfırla — Ofsayt Yok</title>
          <meta name="robots" content="noindex, nofollow" />
        </Head>
        <div className={styles.wrapper}>
          <div className={styles.card}>
            <h1 className={styles.title}>Geçersiz Bağlantı</h1>
            <p className={styles.footer}>
              Bu sıfırlama bağlantısı geçersiz veya eksik.
            </p>
            <p className={styles.footer}>
              <Link href="/auth/forgot-password" className={styles.link}>
                Yeni bağlantı iste
              </Link>
            </p>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <Head>
        <title>Şifre Sıfırla — Ofsayt Yok</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <div className={styles.wrapper}>
        <div className={styles.card}>
          <h1 className={styles.title}>Yeni Şifre Belirle</h1>

          {done ? (
            <p className={styles.footer}>
              Şifren başarıyla güncellendi. Giriş sayfasına yönlendiriliyorsun…
            </p>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: 'contents' }}>
              {error && <p className={styles.error}>{error}</p>}

              <label className={styles.label}>
                Yeni Şifre
                <input
                  className={styles.input}
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={10}
                  autoComplete="new-password"
                  autoFocus
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

              <label className={styles.label}>
                Şifreyi Tekrarla
                <input
                  className={styles.input}
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  autoComplete="new-password"
                />
                {confirmMismatch && (
                  <span style={{ fontSize: 12, color: 'var(--color-danger, #e53e3e)' }}>
                    Şifreler eşleşmiyor
                  </span>
                )}
              </label>

              <button className={styles.submit} type="submit" disabled={loading || !canSubmit}>
                {loading ? 'Kaydediliyor…' : 'Şifremi Güncelle'}
              </button>

              <p className={styles.footer}>
                <Link href="/auth/signin" className={styles.link}>
                  Giriş sayfasına dön
                </Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </>
  )
}
