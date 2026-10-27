// Renders the real app routes (root layout + screens) in memory with expo-router's testing library.
import { renderRouter } from 'expo-router/testing-library';
import RootLayout from '../../app/_layout';
import WelcomeScreen from '../../app/index';
import RegisterScreen from '../../app/register';
import RegisteredScreen from '../../app/registered';
import AppliedScreen from '../../app/applied';

export function renderApp(initialUrl = '/') {
  return renderRouter(
    {
      _layout: RootLayout,
      index: WelcomeScreen,
      register: RegisterScreen,
      registered: RegisteredScreen,
      applied: AppliedScreen,
    },
    { initialUrl },
  );
}
