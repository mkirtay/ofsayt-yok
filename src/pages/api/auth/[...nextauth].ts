import NextAuth from 'next-auth'
import { authOptions } from '@/lib/auth-options'

export { authOptions } from '@/lib/auth-options'

export default NextAuth(authOptions)
