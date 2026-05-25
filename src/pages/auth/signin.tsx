import type { GetStaticProps } from 'next'
import { useState, FormEvent } from 'react'
import { serverSideTranslations } from '@/lib/serverSideTranslations'
import { useTranslation } from '@/lib/i18n'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import Head from 'next/head'
import styles from './auth.module.scss'

export default function SignInPage() {
  const router = useRouter()
  const { t } = useTranslation('auth')
  const verified = router.query.verified
  const reset = router.query.reset
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const result = await signIn('credentials', {
      redirect: false,
      identifier,
      password,
    })

    setLoading(false)

    if (result?.error) {
      setError(t('signIn.invalidCredentials'))
      return
    }

    router.push((router.query.callbackUrl as string) || '/')
  }

  return (
    <>
      <Head>
        <title>{t('signIn.pageTitle')}</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <div className={styles.wrapper}>
        <form className={styles.card} onSubmit={handleSubmit}>
          <h1 className={styles.title}>{t('signIn.title')}</h1>

          {reset === '1' && (
            <p className={styles.footer}>{t('signIn.passwordUpdated')}</p>
          )}
          {verified === '1' && (
            <p className={styles.footer}>{t('signIn.emailVerified')}</p>
          )}
          {verified === '0' && (
            <p className={styles.error}>{t('signIn.invalidVerification')}</p>
          )}
          {verified === 'invalid' && (
            <p className={styles.error}>{t('signIn.missingVerification')}</p>
          )}

          {error && <p className={styles.error}>{error}</p>}

          <label className={styles.label}>
            {t('signIn.emailOrUsername')}
            <input
              className={styles.input}
              type="text"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              required
              autoComplete="username"
            />
          </label>

          <label className={styles.label}>
            {t('signIn.password')}
            <input
              className={styles.input}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </label>

          <button className={styles.submit} type="submit" disabled={loading}>
            {loading ? t('signIn.submitting') : t('signIn.submit')}
          </button>

          <p className={styles.footer}>
            <Link href="/auth/forgot-password" className={styles.link}>
              {t('signIn.forgotPassword')}
            </Link>
          </p>

          <p className={styles.footer}>
            {t('signIn.noAccount')}{' '}
            <Link href="/auth/signup" className={styles.link}>
              {t('signIn.signUpLink')}
            </Link>
          </p>
        </form>
      </div>
    </>
  )
}

export const getStaticProps: GetStaticProps = async ({ locale }) => ({
  props: {
    ...(await serverSideTranslations(locale ?? 'tr', ['common', 'nav', 'auth'])),
  },
})
