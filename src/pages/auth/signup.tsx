import type { GetStaticProps } from 'next'
import { useEffect, useMemo, useState, FormEvent } from 'react'
import { serverSideTranslations } from '@/lib/serverSideTranslations'
import { useTranslation } from '@/lib/i18n'
import '@/lib/i18nNamespaces/auth';
import { useRouter } from 'next/router'
import Link from 'next/link'
import Head from 'next/head'
import { validatePassword } from '@/lib/validation'
import GoogleSignInButton from '@/components/GoogleSignInButton'
import { safeCallbackPath } from '@/lib/authRedirect'
import { isGoogleAuthEnabled } from '@/lib/oauthEnv'
import { markSessionAttributionSent, readSessionAttribution } from '@/lib/signupAttributionClient'
import AuthStage from '@/components/AuthStage'
import { useRedirectIfSignedIn } from '@/hooks/useRedirectIfSignedIn'
import { PRIVACY_PATH, TERMS_PATH } from '@/config/legalConsent'
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

export default function SignUpPage({ googleEnabled }: { googleEnabled: boolean }) {
  const router = useRouter()
  const { t } = useTranslation('auth')
  useRedirectIfSignedIn()
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [turnstileToken, setTurnstileToken] = useState('')
  const [acceptedTerms, setAcceptedTerms] = useState(false)
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

    // Düğme zaten kapalı; Enter ile gönderime karşı da. Sunucu ayrıca doğrular (api/auth/register.ts).
    if (!acceptedTerms) {
      setError(t('signUp.termsRequired'))
      return
    }

    if (turnstileRequired && !turnstileToken) {
      setError(t('signUp.completeVerification'))
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
        acceptedTerms,
        // Kayıt kaynağı (ilk temas) — yalnız bu tarayıcı oturumunda tutulan utm_* (bkz. signupAttributionClient.ts)
        attribution: readSessionAttribution() ?? undefined,
      }),
    })
    if (res.ok) markSessionAttributionSent()

    const data = await res.json()

    setLoading(false)

    if (!res.ok) {
      setError(data.error || t('signUp.registrationFailed'))
      if (window.turnstile) window.turnstile.reset()
      setTurnstileToken('')
      return
    }

    void router.push(`/auth/verify-email-sent?email=${encodeURIComponent(email)}`)
  }

  return (
    <>
      <Head>
        <title>{t('signUp.pageTitle')}</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <div className={styles.wrapper}>
        <div className={styles.stage}>
          <AuthStage className={styles.stageScene} goalLabel={t('stage.goal')} hintLabel={t('stage.hint')} />
          <form className={styles.card} onSubmit={handleSubmit}>
            <h1 className={styles.title}>{t('signUp.title')}</h1>

            <ul className={styles.benefits} aria-label={t('signUp.benefitsLabel')}>
              <li>{t('signUp.benefitVerify')}</li>
              <li>{t('signUp.benefitWeekly')}</li>
            </ul>

            {error && <p className={styles.error}>{error}</p>}

            {googleEnabled && <GoogleSignInButton callbackPath={safeCallbackPath(router.query.callbackUrl)} />}

            <label className={styles.label}>
              {t('signUp.name')}
              <input
                className={styles.input}
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
              />
            </label>

            <label className={styles.label}>
              {t('signUp.username')}
              <input
                className={styles.input}
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={t('signUp.usernamePlaceholder')}
                maxLength={30}
                autoComplete="username"
              />
            </label>

            <label className={styles.label}>
              {t('signUp.email')}
              <input
                className={styles.input}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </label>

            {/* Kural listesi etiketin DIŞINDA: içeride olunca alanın erişilebilir adına karışıyordu (aria-describedby ile bağlı). */}
            <div className={styles.label}>
              <label htmlFor="signup-password">{t('signUp.password')}</label>
              <div className={styles.passwordField}>
                <input
                  id="signup-password"
                  className={styles.input}
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={10}
                  autoComplete="new-password"
                  aria-describedby="signup-password-rules"
                />
                <button
                  type="button"
                  className={styles.passwordToggle}
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? t('password.hide') : t('password.show')}
                  aria-pressed={showPassword}
                  aria-controls="signup-password"
                >
                  <EyeIcon off={showPassword} />
                </button>
              </div>
              {/* Kurallar alan boşken de görünür (nötr ○); sağlananlar yeşil ✓, yazılmışken eksikler ✗. */}
              <ul id="signup-password-rules" className={styles.ruleList}>
                {pwCheck.results.map((r) => (
                  <li
                    key={r.key}
                    className={r.passed ? styles.rulePassed : styles.ruleFailed}
                  >
                    <span className={styles.ruleIcon} aria-hidden="true">
                      {r.passed ? '✓' : pwTouched ? '✗' : '○'}
                    </span>
                    {t(`password.${r.key}`)}
                  </li>
                ))}
              </ul>
            </div>

            {/* Kullanım Şartları + Gizlilik onayı (zorunlu). Bağlantılar yeni sekmede: form içeriği kaybolmasın. */}
            <label className={styles.consent}>
              <input
                type="checkbox"
                className={styles.consentBox}
                checked={acceptedTerms}
                onChange={(e) => setAcceptedTerms(e.target.checked)}
                required
              />
              <span>
                {t('signUp.consentBefore')}
                <a href={TERMS_PATH} target="_blank" rel="noopener noreferrer" className={styles.link}>
                  {t('signUp.termsLink')}
                  <span className={styles.srOnly}> {t('signUp.opensInNewTab')}</span>
                </a>
                {t('signUp.consentMiddle')}
                <a href={PRIVACY_PATH} target="_blank" rel="noopener noreferrer" className={styles.link}>
                  {t('signUp.privacyLink')}
                  <span className={styles.srOnly}> {t('signUp.opensInNewTab')}</span>
                </a>
                {t('signUp.consentAfter')}
              </span>
            </label>

            {turnstileRequired ? <div id="turnstile-container" className={styles.turnstile} /> : null}
            {turnstileRequired && !turnstileToken ? (
              <p className={styles.footer}>{t('signUp.completeVerificationFirst')}</p>
            ) : null}

            <button
              className={styles.submit}
              type="submit"
              disabled={loading || !acceptedTerms || !pwCheck.valid || (turnstileRequired && !turnstileToken)}
            >
              {loading ? t('signUp.submitting') : t('signUp.submit')}
            </button>

            <p className={styles.footer}>
              {t('signUp.alreadyHaveAccount')}{' '}
              <Link href="/auth/signin" className={styles.link}>
                {t('signUp.signInLink')}
              </Link>
            </p>
          </form>
        </div>
      </div>
    </>
  )
}

/** Göz ikonu (açık / üstü çizili); dekoratif — adı düğmenin aria-label'ı verir. */
function EyeIcon({ off }: { off: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
      {off && <path d="M3 3l18 18" />}
    </svg>
  )
}

export const getStaticProps: GetStaticProps = async ({ locale }) => ({
  props: {
    ...(await serverSideTranslations(locale ?? 'tr', ['common', 'nav', 'auth'])),
    googleEnabled: isGoogleAuthEnabled(),
  },
})
