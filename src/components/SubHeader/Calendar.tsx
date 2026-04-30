import { useRef, useEffect } from 'react';
import DatePicker, { registerLocale } from 'react-datepicker';
import { tr } from 'date-fns/locale';
import 'react-datepicker/dist/react-datepicker.css';
import styles from './calendar.module.scss';

registerLocale('tr', tr);

interface CalendarProps {
  selectedDate: string;
  onSelect: (date: string) => void;
  onClose: () => void;
}

function toDate(iso: string): Date {
  return new Date(iso + 'T12:00:00');
}

function toIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export default function Calendar({ selectedDate, onSelect, onClose }: CalendarProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function handleEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [onClose]);

  return (
    <div ref={wrapperRef} className={styles.calendarDropdown}>
      <DatePicker
        selected={toDate(selectedDate)}
        onChange={(date: Date | null) => {
          if (date) {
            onSelect(toIso(date));
          }
        }}
        locale="tr"
        inline
        calendarStartDay={1}
        todayButton="Bugün"
        showWeekNumbers={false}
      />
    </div>
  );
}
