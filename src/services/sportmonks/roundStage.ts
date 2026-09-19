/**
 * Sportmonks `round`/`stage` alanlarını AYRI iki alana çözer.
 *
 * Kaynak: docs/SPORTMONKS_MIGRATION.md Pass 3 "Soru 3". İlk varsayım
 * (`round.name`'in knockout turnuvalarda "QF"/"Final" gibi bir etiket
 * döndüreceği) YANLIŞ çıktı: knockout fikstürlerinde `round` hep `null`,
 * asıl bilgi `stage.name`'de (`"Knockout Round Play-offs"`, `"8th Finals"`,
 * `"Quarter-finals"`, `"Semi-finals"`, `"Final"`). Lig maçlarında ise
 * `round.name` düz bir hafta numarası ("6") döndürüyor, `stage` genelde
 * "Regular Season" gibi genel bir faz.
 *
 * Karar 3: mevcut tek `Match.round: string` alanı yerine `{round, stage}`
 * iki AYRI alan olarak tutuluyor — ikisi normalde aynı anda dolu olmaz,
 * ama hangisi doluysa onu tek bir gösterim etiketine indirgemek isteyen
 * çağıranlar için `pickRoundStageLabel` de sağlanıyor.
 */
import type { SportmonksFixtureRoundStage } from './types';

export type RoundStageInfo = {
  round: string | null;
  stage: string | null;
};

export function resolveRoundAndStage(fixture: SportmonksFixtureRoundStage): RoundStageInfo {
  return {
    round: fixture.round?.name ?? null,
    stage: fixture.stage?.name ?? null,
  };
}

/**
 * "Hangisi doluysa o kullanılır" kolaylık fonksiyonu — knockout turnuvalarda
 * `stage`'i, lig maçlarında `round`'u tercih eder. İkisi de doluysa `round`
 * öncelikli (rapordaki örneklerde ikisinin aynı anda dolu olduğu hiç
 * gözlemlenmedi).
 */
export function pickRoundStageLabel(info: RoundStageInfo): string | null {
  return info.round ?? info.stage ?? null;
}
