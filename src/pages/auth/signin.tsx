import { useState, FormEvent } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import Head from 'next/head'
import styles from './auth.module.scss'

export default function SignInPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const result = await signIn('credentials', {
      redirect: false,
      email,
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

          {error && <p className={styles.error}>{error}</p>}

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
