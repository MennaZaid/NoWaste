// Skeleton check: the Welcome screen shows whether the server answers GET /health.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { screen } from 'expo-router/testing-library';
import { isServerHealthy } from '@/api/client';
import { renderApp } from './helpers/renderApp';

jest.mock('@/api/client', () => ({
  getNotifications: jest.fn().mockResolvedValue({ kind: 'ok', notifications: [], unreadCount: 0 }),
  readNotifications: jest.fn().mockResolvedValue(true),
  getMyWaitlist: jest.fn().mockResolvedValue({ kind: 'ok', entries: [] }),
  isServerHealthy: jest.fn(),
  registerConsumer: jest.fn(),
}));

const mockedIsServerHealthy = jest.mocked(isServerHealthy);

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('Home (Welcome) screen server status', () => {
  test('HEALTH-02 home screen shows Server: connected when /health is ok', async () => {
    mockedIsServerHealthy.mockResolvedValue(true);

    await renderApp();

    expect(await screen.findByText('Server: connected')).toBeOnTheScreen();
  });

  test('HEALTH-04 home screen shows Server: not reachable when /health fails', async () => {
    mockedIsServerHealthy.mockResolvedValue(false);

    await renderApp();

    expect(await screen.findByText('Server: not reachable')).toBeOnTheScreen();
  });
});
