import type { GetServerSidePropsContext } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';
import type { Role } from '@prisma/client';

export type ProfilePageServerPayload = {
  id: string;
  email: string;
  name: string | null;
  username: string | null;
  bio: string | null;
  image: string | null;
  role: Role;
};

export async function loadProfilePageData(
  ctx: Pick<GetServerSidePropsContext, 'req' | 'res'>
): Promise<ProfilePageServerPayload | null> {
  const session = await getServerSession(ctx.req, ctx.res, authOptions);
  const userId = session?.user?.id;
  if (!userId) return null;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      username: true,
      bio: true,
      image: true,
      role: true,
    },
  });
  return user;
}
