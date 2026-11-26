// Renders the real app routes (root layout + screens) in memory with expo-router's testing library.
import { renderRouter } from 'expo-router/testing-library';
import RootLayout from '../../app/_layout';
import WelcomeScreen from '../../app/index';
import RegisterScreen from '../../app/register';
import RegisteredScreen from '../../app/registered';
import AppliedScreen from '../../app/applied';
import LoginScreen from '../../app/login';
import HomeScreen from '../../app/home';
import ApplicationScreen from '../../app/admin/[userId]';
import RamadanTimesScreen from '../../app/admin/ramadan';
import NewListingScreen from '../../app/listings/new';
import QuickPostScreen from '../../app/listings/quick';
import ListingScreen from '../../app/listings/[id]';
import MyListingsScreen from '../../app/listings/index';
import OpeningHoursScreen from '../../app/vendor/hours';
import OfferScreen from '../../app/offers/[id]';
import ReservationScreen from '../../app/reservations/[id]';
import MyReservationsScreen from '../../app/reservations/index';
import ProfileScreen from '../../app/profile';
import ImpactScreen from '../../app/impact';
import PayScreen from '../../app/pay/[id]';
import PartnerOfferScreen from '../../app/partner/offers/[id]';
import PartnerPickupScreen from '../../app/partner/pickups/[id]';
import ZakatDonateScreen from '../../app/zakat/new/[id]';
import ZakatReceiptScreen from '../../app/zakat/[id]';
import ZakatReceiptsScreen from '../../app/zakat/index';

export function renderApp(initialUrl = '/') {
  return renderRouter(
    {
      _layout: RootLayout,
      index: WelcomeScreen,
      register: RegisterScreen,
      registered: RegisteredScreen,
      applied: AppliedScreen,
      login: LoginScreen,
      home: HomeScreen,
      'admin/[userId]': ApplicationScreen,
      'admin/ramadan': RamadanTimesScreen,
      'listings/new': NewListingScreen,
      'listings/quick': QuickPostScreen,
      'listings/[id]': ListingScreen,
      'listings/index': MyListingsScreen,
      'vendor/hours': OpeningHoursScreen,
      'offers/[id]': OfferScreen,
      'reservations/[id]': ReservationScreen,
      'reservations/index': MyReservationsScreen,
      profile: ProfileScreen,
      impact: ImpactScreen,
      'pay/[id]': PayScreen,
      'partner/offers/[id]': PartnerOfferScreen,
      'partner/pickups/[id]': PartnerPickupScreen,
      'zakat/new/[id]': ZakatDonateScreen,
      'zakat/[id]': ZakatReceiptScreen,
      'zakat/index': ZakatReceiptsScreen,
    },
    { initialUrl },
  );
}
