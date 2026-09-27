import type { GetStaticProps } from 'next'
import { useEffect, useState, FormEvent } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import Head from 'next/head'
import { serverSideTranslations } from '@/lib/serverSideTranslations'
import { useTranslation } from '@/lib/i18n'
import { safeCallbackPath } from '@/lib/authRedirect'
import { usernameRules } from '@/lib/validation'
import styles from './auth.module.scss'

/** Dönüş adresi doğrudan URL'den (router.isReady'ye bağlı kalmadan). */
function readTarget(): string {
  return safeCallbackPath(new URLSearchParams(window.location.search).get('callbackUrl'))
}

/**
 * Google ile ilk girişten sonra kullanıcı adı adımı. Kullanıcı adı zaten varsa (veya oturum yoksa) sayfa hemen
 * yönlendirir. Zorunlu değil ("Şimdilik geç"); Gündem'de post/yorum API'si ad seçilene kadar 403 döner.
 */
export default function ChooseUsernamePage() {
  const router = useRouter()
  const { t } = useTranslation('auth')
  const { data: session, status, update } = useSession()
  const [username, setUsername] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const hasUsername = !!session?.user?.username
  const redirecting = status === 'unauthenticated' || (status === 'authenticated' && hasUsername)

  useEffect(() => {
    if (status === 'unauthenticated') void router.replace(`/auth/signin?callbackUrl=${encodeURIComponent(readTarget())}`)
    else if (status === 'authenticated' && hasUsername) void router.replace(readTarget())
  }, [router, status, hasUsername])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    const value = username.trim()
    if (!usernameRules.pattern.test(value)) {
      setError(t('chooseUsername.rules'))
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/user/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: value }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string; username?: string | null }
      if (!res.ok) {
        setError(data.error || t('chooseUsername.error'))
        return
      }
      await update({ username: data.username ?? value })
      void router.replace(readTarget())
    } catch {
      setError(t('chooseUsername.error'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Head>
        <title>{t('chooseUsername.pageTitle')}</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <div className={styles.wrapper}>
        {status === 'loading' || redirecting ? null : (
          <form className={styles.card} onSubmit={handleSubmit}>
            <h1 className={styles.title}>{t('chooseUsername.title')}</h1>
            <p className={styles.footer}>{t('chooseUsername.intro')}</p>

            {error && (
              <p className={styles.error} role="alert">
                {error}
              </p>
            )}

            <label className={styles.label}>
              {t('chooseUsername.label')}
              <input
                className={styles.input}
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={t('chooseUsername.placeholder')}
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                minLength={3}
                maxLength={30}
                required
                autoFocus
              />
              <span className={styles.hint}>{t('chooseUsername.rules')}</span>
            </label>

            <button className={styles.submit} type="submit" disabled={saving || !username.trim()}>
              {saving ? t('chooseUsername.submitting') : t('chooseUsername.submit')}
            </button>

            <p className={styles.footer}>
              {/* Form yalnızca istemcide (oturum çözülünce) render edilir → window güvenli */}
              <Link href={readTarget()} className={styles.link}>
                {t('chooseUsername.skip')}
              </Link>
            </p>
          </form>
        )}
      </div>
    </>
  )
}

export const getStaticProps: GetStaticProps = async ({ locale }) => ({
  props: {
    ...(await serverSideTranslations(locale ?? 'tr', ['common', 'nav', 'auth'])),
  },
})
