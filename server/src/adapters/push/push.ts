// C-25 Push Adapter (SDD 3.2.1, IPush): sends a notification to a user's phone. The provider is open (SRS TBD-2), and
// push needs a development build of the app (Expo Go cannot receive it on this project; an iPhone build needs a paid
// Apple Developer account), so decision D-118 keeps two modes for now: "off" (default, nothing is sent; the app shows
// the same information on its screens, IF-SW-06) and "mock" (remembers what would be sent, for tests and demos).
// An Expo push mode (device tokens from expo-notifications) will implement the same interface.

export type PushKind = 'reservation_confirmed' | 'reservation_released' | 'waitlist_offer' | 'window_open';

export interface PushMessage {
  kind: PushKind;
  /** Plain data for the app to open the right screen; the texts are built on the phone in its language (NFR-06). */
  data: Record<string, string>;
}

export interface IPush {
  send(userId: string, message: PushMessage): Promise<void>;
}

/** Mock mode: keeps what would have been sent. */
export function createMockPush(): IPush & { sent: { userId: string; message: PushMessage }[] } {
  const sent: { userId: string; message: PushMessage }[] = [];
  return {
    sent,
    send(userId, message) {
      sent.push({ userId, message });
      return Promise.resolve();
    },
  };
}

/** Off mode: nothing is sent. */
export function createOffPush(): IPush {
  return { send: () => Promise.resolve() };
}

let push: IPush | undefined;

/** PUSH_MODE=mock gives the mock; anything else (default) is off. */
export function getPush(): IPush {
  push ??= process.env.PUSH_MODE === 'mock' ? createMockPush() : createOffPush();
  return push;
}

/** Replaces the adapter (tests, or the Expo push mode later). */
export function setPush(replacement: IPush | undefined): void {
  push = replacement;
}
