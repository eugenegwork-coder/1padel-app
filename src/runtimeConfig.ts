import { Platform } from 'react-native';
import backend from '../config/backend.cjs';

export const runtimeConfig = backend.resolveBackend({
  apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL,
  platform: Platform.OS,
  webOrigin: Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.origin : undefined,
  // Metro and the local preview server provide a read-only schedule proxy.
  localScheduleProxy: true,
});
