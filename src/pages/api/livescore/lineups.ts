import type { NextApiRequest, NextApiResponse } from "next";

import { buildApiUrl } from "@/pages/api/livescore/_shared";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const matchId = req.query.match_id ?? req.query.id;
    if (!matchId) {
      res.status(400).json({ success: false, error: "Missing match_id" });
      return;
    }

    const url = buildApiUrl("matches/lineups.json", {
      match_id: String(matchId),
    });
    const response = await fetch(url);
    const data = await response.json();
    res.status(response.ok ? 200 : response.status).json(data);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
