// Entry point 2 of 2 (SDD 2.4): the Scheduler / Worker, SDD C-19. It runs beside the API, not under it
// (docs/feedback-changes.md), and calls the same application services.
// Jobs (SDD 5.5): expire no-card holds (FR-RES-05, US-28), make automatic charity offers (FR-RTE-11, US-23) and
// refund uncollected Zakat donations (E-TGI-03, BR-11, US-43). Releasing holds also runs the waitlist: expired
// offers pass on and freed bags are offered (FR-RES-06, BR-05, US-29).
// How often it checks is the settings row C-19.
import { getSetting } from './data/settingsRepository.js';
import { makeAutomaticCharityOffers } from './services/partner-offer/autoCharityOfferService.js';
import { makeWindowOpenNotifications } from './services/notification/notificationService.js';
import { releaseExpiredHolds } from './services/reservation/reservationService.js';
import { refundUncollectedZakat } from './services/zakat-receipt/zakatService.js';

async function pollSeconds(): Promise<number> {
  const value = (await getSetting('C-19'))?.value as { poll_seconds?: unknown } | null | undefined;
  if (typeof value?.poll_seconds !== 'number' || value.poll_seconds <= 0) {
    throw new Error('Settings row C-19 is missing or invalid');
  }
  return value.poll_seconds;
}

async function tick(): Promise<void> {
  try {
    const released = await releaseExpiredHolds();
    if (released > 0) console.log(`worker: released ${String(released)} expired hold(s)`);
  } catch (error) {
    // One failed run must not stop the worker; the next run picks up the same due holds (SDD 5.5).
    console.error('worker: releasing expired holds failed', error);
  }
  try {
    const offered = await makeAutomaticCharityOffers();
    if (offered > 0) console.log(`worker: offered ${String(offered)} listing(s) to charities`);
  } catch (error) {
    console.error('worker: automatic charity offers failed', error);
  }
  try {
    const refunded = await refundUncollectedZakat();
    if (refunded > 0) console.log(`worker: refunded ${String(refunded)} uncollected Zakat donation(s)`);
  } catch (error) {
    console.error('worker: Zakat refunds failed', error);
  }
  try {
    // US-34 (FR-RES-11, SDD 5.5 "Pickup window opens", D-121): "your bag is ready", once per reservation.
    const told = await makeWindowOpenNotifications();
    if (told > 0) console.log(`worker: told ${String(told)} consumer(s) their bag is ready`);
  } catch (error) {
    console.error('worker: window-open notifications failed', error);
  }
}

async function main(): Promise<void> {
  const seconds = await pollSeconds();
  console.log(`worker started, checking every ${String(seconds)} s`);
  await tick();
  setInterval(() => {
    void tick();
  }, seconds * 1000);
}

void main().catch((error: unknown) => {
  console.error('worker could not start', error);
  process.exit(1);
});
