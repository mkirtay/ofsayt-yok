import type { GetStaticProps } from 'next'
import { useState, FormEvent } from 'react'
import { serverSideTranslations } from '@/lib/serverSideTranslations'
import { useTranslation } from '@/lib/i18n'
import Link from 'next/link'
import Head from 'next/head'
import styles from './auth.module.scss'

export default function ForgotPasswordPage() {
  const { t } = useTranslation('auth')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const res = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })

    setLoading(false)

    if (res.status === 429) {
      const data = await res.json()
      setError(data.error || t('forgotPassword.tooManyAttempts'))
      return
    }

    setSent(true)
  }

  return (
    <>
      <Head>
        <title>{t('forgotPassword.pageTitle')}</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <div className={styles.wrapper}>
        <div className={styles.card}>
          <h1 className={styles.title}>{t('forgotPassword.title')}</h1>

          {sent ? (
            <>
              <p className={styles.footer}>{t('forgotPassword.sentMessage')}</p>
              <p className={styles.footer}>
                <Link href="/auth/signin" className={styles.link}>
                  {t('forgotPassword.backToSignIn')}
                </Link>
              </p>
            </>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: 'contents' }}>
              {error && <p className={styles.error}>{error}</p>}

              <p className={styles.footer}>{t('forgotPassword.instructions')}</p>

              <label className={styles.label}>
                {t('forgotPassword.email')}
                <input
                  className={styles.input}
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  autoFocus
                />
              </label>

              <button className={styles.submit} type="submit" disabled={loading}>
                {loading ? t('forgotPassword.submitting') : t('forgotPassword.submit')}
              </button>

              <p className={styles.footer}>
                <Link href="/auth/signin" className={styles.link}>
                  {t('forgotPassword.backToSignIn')}
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
