import { useState, FormEvent } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import Head from 'next/head'
import styles from './auth.module.scss'

export default function SignUpPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password }),
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
              minLength={6}
              autoComplete="new-password"
            />
          </label>

          <button className={styles.submit} type="submit" disabled={loading}>
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
