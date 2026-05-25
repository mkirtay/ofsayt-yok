import type { GetStaticProps } from 'next'
import { useState, useMemo, FormEvent } from 'react'
import { serverSideTranslations } from '@/lib/serverSideTranslations'
import { useTranslation } from '@/lib/i18n'
import { useRouter } from 'next/router'
import { signIn } from 'next-auth/react'
import Link from 'next/link'
import Head from 'next/head'
import { validatePassword } from '@/lib/validation'
import styles from './auth.module.scss'

export default function ResetPasswordPage() {
  const router = useRouter()
  const { t } = useTranslation('auth')
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
      setError(t('resetPassword.invalidToken'))
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
      setError(data.error || t('resetPassword.genericError'))
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
          <title>{t('resetPassword.pageTitle')}</title>
          <meta name="robots" content="noindex, nofollow" />
        </Head>
        <div className={styles.wrapper}>
          <div className={styles.card}>
            <h1 className={styles.title}>{t('resetPassword.invalidLinkTitle')}</h1>
            <p className={styles.footer}>{t('resetPassword.invalidLinkDesc')}</p>
            <p className={styles.footer}>
              <Link href="/auth/forgot-password" className={styles.link}>
                {t('resetPassword.requestNewLink')}
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
        <title>{t('resetPassword.pageTitle')}</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <div className={styles.wrapper}>
        <div className={styles.card}>
          <h1 className={styles.title}>{t('resetPassword.title')}</h1>

          {done ? (
            <p className={styles.footer}>{t('resetPassword.done')}</p>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: 'contents' }}>
              {error && <p className={styles.error}>{error}</p>}

              <label className={styles.label}>
                {t('resetPassword.newPassword')}
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
                        {t(`password.${r.key}`)}
                      </li>
                    ))}
                  </ul>
                )}
              </label>

              <label className={styles.label}>
                {t('resetPassword.confirmPassword')}
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
                    {t('resetPassword.passwordMismatch')}
                  </span>
                )}
              </label>

              <button className={styles.submit} type="submit" disabled={loading || !canSubmit}>
                {loading ? t('resetPassword.submitting') : t('resetPassword.submit')}
              </button>

              <p className={styles.footer}>
                <Link href="/auth/signin" className={styles.link}>
                  {t('resetPassword.backToSignIn')}
                </Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </>
  )
}

export const getStaticProps: GetStaticProps = async ({ locale }) => ({
  props: {
    ...(await serverSideTranslations(locale ?? 'tr', ['common', 'nav', 'auth'])),
  },
})
