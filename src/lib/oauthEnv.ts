/** OAuth env kontrolü — Prisma/NextAuth içermez; sayfaların `getStaticProps`'unda da güvenle kullanılır. */
type Env = Record<string, string | undefined>;

/** Google girişi yalnızca iki env de doluysa aktif; değilse provider da buton da yok. */
export function isGoogleAuthEnabled(env: Env = process.env): boolean {
  return Boolean(env.GOOGLE_CLIENT_ID?.trim() && env.GOOGLE_CLIENT_SECRET?.trim());
}
