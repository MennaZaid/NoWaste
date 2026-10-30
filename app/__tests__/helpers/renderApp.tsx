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
import NewListingScreen from '../../app/listings/new';
import QuickPostScreen from '../../app/listings/quick';
import ListingScreen from '../../app/listings/[id]';

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
      'listings/new': NewListingScreen,
      'listings/quick': QuickPostScreen,
      'listings/[id]': ListingScreen,
    },
    { initialUrl },
  );
}
