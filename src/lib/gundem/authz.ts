import { prisma } from '@/lib/prisma';

/** Rol JWT'den değil DB'den taze okunur (rol düşürülen/yükseltilen kullanıcı hemen etkilenir). */
export async function isAdminUser(userId: string): Promise<boolean> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  return u?.role === 'ADMIN';
}
