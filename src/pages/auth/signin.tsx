import { useState, FormEvent } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import Head from 'next/head'
import styles from './auth.module.scss'

export default function SignInPage() {
  const router = useRouter()
  const verified = router.query.verified
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
      setError('E-posta veya şifre hatalı')
      return
    }

    router.push((router.query.callbackUrl as string) || '/')
  }

  return (
    <>
      <Head>
        <title>Giriş Yap — Ofsayt Yok</title>
      </Head>
      <div className={styles.wrapper}>
        <form className={styles.card} onSubmit={handleSubmit}>
          <h1 className={styles.title}>Giriş Yap</h1>

          {verified === '1' && (
            <p className={styles.footer}>E-posta adresin dogrulandi. Simdi giris yapabilirsin.</p>
          )}
          {verified === '0' && (
            <p className={styles.error}>Dogrulama baglantisi gecersiz veya suresi dolmus.</p>
          )}
          {verified === 'invalid' && (
            <p className={styles.error}>Dogrulama baglantisi eksik veya bozuk.</p>
          )}

          {error && <p className={styles.error}>{error}</p>}

          <label className={styles.label}>
            E-posta veya kullanıcı adı
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
            Şifre
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
            {loading ? 'Giriş yapılıyor…' : 'Giriş Yap'}
          </button>

          <p className={styles.footer}>
            Hesabın yok mu?{' '}
            <Link href="/auth/signup" className={styles.link}>
              Üye Ol
            </Link>
          </p>
        </form>
      </div>
    </>
  )
}
