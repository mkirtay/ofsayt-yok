import { useState, FormEvent } from 'react'
import Link from 'next/link'
import Head from 'next/head'
import styles from './auth.module.scss'

export default function ForgotPasswordPage() {
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
      setError(data.error || 'Cok fazla deneme. Lutfen daha sonra tekrar deneyin.')
      return
    }

    // 200 veya başka hata — her ikisinde de "gönderildi" göster (email enumeration önlemi)
    setSent(true)
  }

  return (
    <>
      <Head>
        <title>Şifremi Unuttum — Ofsayt Yok</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <div className={styles.wrapper}>
        <div className={styles.card}>
          <h1 className={styles.title}>Şifremi Unuttum</h1>

          {sent ? (
            <>
              <p className={styles.footer}>
                E-posta adresin kayıtlıysa birkaç dakika içinde şifre sıfırlama bağlantısı
                gönderilecek. Spam klasörünü de kontrol et.
              </p>
              <p className={styles.footer}>
                <Link href="/auth/signin" className={styles.link}>
                  Giriş sayfasına dön
                </Link>
              </p>
            </>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: 'contents' }}>
              {error && <p className={styles.error}>{error}</p>}

              <p className={styles.footer}>
                Hesabına kayıtlı e-posta adresini gir, sana sıfırlama bağlantısı gönderelim.
              </p>

              <label className={styles.label}>
                E-posta
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
                {loading ? 'Gönderiliyor…' : 'Sıfırlama Bağlantısı Gönder'}
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
