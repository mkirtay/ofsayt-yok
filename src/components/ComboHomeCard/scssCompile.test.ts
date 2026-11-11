import path from 'node:path';
import { describe, expect, it } from 'vitest';
import * as sass from 'sass';

/** Vitest SCSS'i derlemez; bozuk bir stil dosyası ancak tarayıcıda 500 verirdi → dokunulan modüller burada derlenir. */
const FILES = [
  'components/MatchPoll/matchPoll.module.scss',
  'components/ComboHomeCard/comboHomeCard.module.scss',
  'components/MatchOddsCard/matchOddsCard.module.scss',
  'components/MatchDetailContent/matchDetailContent.module.scss',
];

describe('SCSS derlemesi', () => {
  it.each(FILES)('%s derlenir', (f) => {
    const out = sass.compile(path.join(process.cwd(), 'src', f), { quietDeps: true, logger: sass.Logger.silent });
    expect(out.css.length).toBeGreaterThan(50);
  });
});
