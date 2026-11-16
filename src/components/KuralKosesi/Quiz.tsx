import { useId } from 'react';
import { useTranslation } from '@/lib/i18n';
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

/** Bilgi kartının altındaki tek soruluk test: şık seç → doğru/yanlış + kısa açıklama, skor ve sıradaki soru. */
export default function Quiz({ quiz, answer, score, onAnswer, onNext }: QuizProps) {
  const { t } = useTranslation('kuralKosesi');
  const questionId = useId();
  const answered = answer !== undefined;
  const right = answered && answer === quiz.correct;

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
              onClick={() => onAnswer(i)}
            >
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
