// The time left of a no-card hold (D-96, asked for by Maryam on 2026-11-14): "Time left to collect: 14:32", counting
// down every second to the hold end (BR-02, 15 minutes; "I'm on my way" moves the end 10 minutes later, BR-03).
// Under 5 minutes it turns red. At zero it calls onEnd once, so the screen can reload the reservation.
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { localDigits } from '@/i18n/digits';
import { useLanguage } from '@/i18n/LanguageProvider';
import { AppText } from './AppText';

const SECOND = 1000;
const WARN_BELOW = 5 * 60 * SECOND;

/** m:ss, or h:mm:ss from an hour up. */
export function formatLeft(ms: number): string {
  const total = Math.max(0, Math.floor(ms / SECOND));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, '0');
  return hours > 0
    ? `${String(hours)}:${String(minutes).padStart(2, '0')}:${seconds}`
    : `${String(minutes)}:${seconds}`;
}

interface CountdownProps {
  /** ISO time the hold ends. */
  until: string;
  onEnd?: () => void;
  variant?: 'heading' | 'body';
  /** D-97: the text around the time; "Time left to collect" by default, "Starts in" before the slot. */
  labelKey?: 'reservation.timeLeft' | 'reservation.startsIn' | 'waitlist.bannerLeft';
  /** Red under 5 minutes (only for the time left to collect). */
  warn?: boolean;
  testID?: string;
}

/** The time now, updated every second, for screens that change when a time is reached (D-96, D-97). */
export function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, SECOND);
    return () => {
      clearInterval(timer);
    };
  }, []);
  return now;
}

export function Countdown({
  until,
  onEnd,
  variant = 'body',
  labelKey = 'reservation.timeLeft',
  warn = true,
  testID,
}: CountdownProps) {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const now = useNow();
  const ended = useRef(false);
  const left = Date.parse(until) - now;

  useEffect(() => {
    ended.current = false;
  }, [until]);

  useEffect(() => {
    if (left <= 0 && !ended.current) {
      ended.current = true;
      onEnd?.();
    }
  }, [left, onEnd]);

  return (
    <AppText
      testID={testID}
      variant={variant}
      color={warn && left < WARN_BELOW ? 'error' : 'primary'}
      accessibilityLiveRegion="polite"
    >
      {t(labelKey, { time: localDigits(formatLeft(left), language) })}
    </AppText>
  );
}
