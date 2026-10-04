import type { GetStaticProps } from 'next'
import { useState, FormEvent } from 'react'
import { serverSideTranslations } from '@/lib/serverSideTranslations'
import { useTranslation } from '@/lib/i18n'
import '@/lib/i18nNamespaces/auth';
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import Head from 'next/head'
import GoogleSignInButton from '@/components/GoogleSignInButton'
import { safeCallbackPath } from '@/lib/authRedirect'
import { isGoogleAuthEnabled } from '@/lib/oauthEnv'
import AuthStage from '@/components/AuthStage'
import { useRedirectIfSignedIn } from '@/hooks/useRedirectIfSignedIn'
import styles from './auth.module.scss'

/** NextAuth'un `?error=` kodu → çeviri anahtarı (OAuth dönüşleri). CredentialsSignin burada gelmez (redirect: false). */
function oauthErrorKey(code: unknown): string | null {
  if (typeof code !== 'string' || !code) return null
  if (code === 'OAuthAccountNotLinked') return 'signIn.oauthNotLinked'
  if (code === 'GoogleEmailNotVerified') return 'signIn.googleEmailNotVerified'
  if (code === 'CredentialsSignin') return null
  return 'signIn.oauthError'
}

export default function SignInPage({ googleEnabled }: { googleEnabled: boolean }) {
  const router = useRouter()
  const { t } = useTranslation('auth')
  useRedirectIfSignedIn()
  const verified = router.query.verified
  const reset = router.query.reset
  const callbackPath = safeCallbackPath(router.query.callbackUrl)
  const oauthError = oauthErrorKey(router.query.error)
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
      setError(t(result.error === 'RateLimited' ? 'signIn.tooManyAttempts' : 'signIn.invalidCredentials'))
      return
    }

    router.push(callbackPath)
  }

  return (
    <>
      <Head>
        <title>{t('signIn.pageTitle')}</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <div className={styles.wrapper}>
        <div className={styles.stage}>
          <AuthStage className={styles.stageScene} goalLabel={t('stage.goal')} hintLabel={t('stage.hint')} />
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

            {oauthError && !error && (
              <p className={styles.error} role="alert">
                {t(oauthError)}
              </p>
            )}
            {error && <p className={styles.error}>{error}</p>}

            {googleEnabled && <GoogleSignInButton callbackPath={callbackPath} />}

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
      </div>
    </>
  )
}

export const getStaticProps: GetStaticProps = async ({ locale }) => ({
  props: {
    ...(await serverSideTranslations(locale ?? 'tr', ['common', 'nav', 'auth'])),
    googleEnabled: isGoogleAuthEnabled(),
  },
})
