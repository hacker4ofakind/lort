import type { Brand } from './types';

/** Branding used when the Go proxy's X-Lort-Config header is missing (e.g. `next dev` on its own). */
export const DEFAULT_BRAND: Brand = {
  appName: 'My app',
  logo: '',
  primaryColor: '#cc3a6d',
  showLandingCard: true,
  roadmapPublic: true,
  features: { email: false, voice: false, turnstile: false },
};
