/**
 * GET /api/compare/teams?competitionId=6
 *
 * Bir ligin puan durumundan takım listesi döner: [{ id, name, logo }]
 * CompareTeamPicker dropdown'ı için kullanılır.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { hitFixedWindowRateLimit, requestIp } from '@/lib/rateLimit';
import { runWithLiveScoreHttpClient } from '@/services/liveScoreHttpContext';
import { livescoreAxiosFromIncomingMessage } from '@/server/livescoreInternalAxios';
import { getCompetitionTableFull } from '@/services/liveScoreService';

export type CompareTeamItem = {
  id: number;
  name: string;
  logo?: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<CompareTeamItem[] | { error: string }>
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const ip = requestIp(
    req.headers as Record<string, string | string[] | undefined>,
    req.socket?.remoteAddress,
  );
  const rl = await hitFixedWindowRateLimit(`compare-teams:${ip}`, 30, 60_000);
  if (!rl.success) {
    res.setHeader('Retry-After', String(Math.ceil((rl.resetAt - Date.now()) / 1000)));
    return res.status(429).json({ error: 'Too many requests' });
  }

  const { competitionId } = req.query;
  if (!competitionId || typeof competitionId !== 'string') {
    return res.status(400).json({ error: 'competitionId zorunlu' });
  }

  const axios = livescoreAxiosFromIncomingMessage(req);
  const table = await runWithLiveScoreHttpClient(axios, () =>
    getCompetitionTableFull(competitionId).catch(() => null)
  );

  if (!table) {
    return res.status(200).json([]);
  }

  const teams = new Map<number, CompareTeamItem>();

  const addRow = (row: { team?: { id: number; name: string; logo?: string }; team_id?: number; name?: string; logo?: string }) => {
    const id = row.team?.id ?? row.team_id;
    const name = row.team?.name ?? row.name;
    if (id != null && name) {
      teams.set(id, { id, name, logo: row.team?.logo ?? row.logo });
    }
  };

  if (Array.isArray(table.table)) {
    table.table.forEach(addRow);
  }
  for (const stage of table.stages ?? []) {
    for (const group of stage.groups ?? []) {
      (group.standings ?? []).forEach(addRow);
    }
  }

  const sorted = Array.from(teams.values()).sort((a, b) =>
    a.name.localeCompare(b.name, 'tr')
  );

  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=7200');
  return res.status(200).json(sorted);
}
