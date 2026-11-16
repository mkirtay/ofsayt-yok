import { useEffect, useId, useState, type CSSProperties } from 'react';
import { useTranslation } from '@/lib/i18n';
import '@/lib/i18nNamespaces/kuralKosesi';
import type { LocalizedQuiz } from './facts';
import type { QuizScore } from './quizState';
import styles from './panel.module.scss';

type QuizProps = {
  quiz: LocalizedQuiz;
  /** Bu soruya verilen ilk cevap (şık sırası); henüz cevaplanmadıysa undefined. */
  answer: number | undefined;
  score: QuizScore;
  onAnswer: (choice: number) => void;
  /** Cevaplanmamış sıradaki soruya geç; hepsi cevaplandıysa undefined (düğme yerine tamamlandı notu). */
  onNext?: () => void;
};

const CONFETTI_COLORS = ['#00a76f', '#2fd39b', '#ffc107', '#ffffff', '#ff5630', '#3b82f6'];
const CONFETTI_PIECES = 22;
/** Konfeti ömrü (scss'teki animasyon süresi + pay); sonra parçalar DOM'dan kalkar. */
const CONFETTI_MS = 1100;

/** Doğru şıkkın ortasından dışa saçılan konfeti; parçaların yönü/rengi her patlamada rastgele. Hareketi azalt'ta gizli. */
function Confetti() {
  const [pieces] = useState(() =>
    Array.from({ length: CONFETTI_PIECES }, (_, i) => {
      const angle = (i / CONFETTI_PIECES) * Math.PI * 2 + Math.random() * 0.5;
      const dist = 50 + Math.random() * 70;
      return {
        '--x': `${Math.round(Math.cos(angle) * dist * 1.6)}px`,
        '--y': `${Math.round(Math.sin(angle) * dist - 30)}px`,
        '--r': `${Math.round(Math.random() * 720 - 360)}deg`,
        '--d': `${Math.round(Math.random() * 120)}ms`,
        background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        width: i % 3 === 0 ? 8 : 6,
        height: i % 3 === 0 ? 8 : 10,
        borderRadius: i % 3 === 0 ? '50%' : 2,
      } as CSSProperties;
    }),
  );
  return (
    <span className={styles.confetti} aria-hidden="true">
      {pieces.map((style, i) => (
        <span key={i} className={styles.confettiPiece} style={style} />
      ))}
    </span>
  );
}

/** Bilgi kartının altındaki tek soruluk test: şık seç → doğru/yanlış + kısa açıklama, skor ve sıradaki soru. */
export default function Quiz({ quiz, answer, score, onAnswer, onNext }: QuizProps) {
  const { t } = useTranslation('kuralKosesi');
  const questionId = useId();
  const answered = answer !== undefined;
  const right = answered && answer === quiz.correct;
  // Konfeti yalnız bu açılışta doğru cevaplanınca (daha önce cevaplanmış soruya dönünce patlamaz).
  const [burst, setBurst] = useState(false);
  useEffect(() => {
    if (!burst) return;
    const id = window.setTimeout(() => setBurst(false), CONFETTI_MS);
    return () => window.clearTimeout(id);
  }, [burst]);

  return (
    <section className={styles.quiz} aria-labelledby={questionId}>
      <small className={styles.quizLabel}>{t('quizLabel')}</small>
      <p id={questionId} className={styles.quizQuestion}>
        {quiz.question}
      </p>
      <div className={styles.quizOptions} role="group" aria-labelledby={questionId}>
        {quiz.options.map((option, i) => {
          const state = !answered
            ? ''
            : i === quiz.correct
              ? styles.optionRight
              : i === answer
                ? styles.optionWrong
                : styles.optionDim;
          return (
            <button
              key={i}
              type="button"
              className={`${styles.option} ${state}`}
              disabled={answered}
              aria-pressed={answered ? i === answer : undefined}
              onClick={() => {
                if (answered) return;
                if (i === quiz.correct) setBurst(true);
                onAnswer(i);
              }}
            >
              {burst && i === quiz.correct ? <Confetti /> : null}
              <span className={styles.optionKey} aria-hidden="true">
                {String.fromCharCode(65 + i)}
              </span>
              <span>{option}</span>
            </button>
          );
        })}
      </div>
      <div aria-live="polite">
        {answered ? (
          <p className={`${styles.quizFeedback} ${right ? styles.feedbackRight : styles.feedbackWrong}`}>
            <strong>{right ? t('quizCorrect') : t('quizWrong')}</strong> {quiz.explanation}
          </p>
        ) : null}
      </div>
      {score.answered > 0 ? (
        <div className={styles.quizFoot}>
          <span>
            {score.answered === score.total
              ? t('quizDone', { correct: score.correct, total: score.total })
              : t('quizScore', { correct: score.correct, answered: score.answered })}
          </span>
          {answered && onNext ? (
            <button type="button" className={styles.quizNext} onClick={onNext}>
              {t('quizNext')} ›
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
