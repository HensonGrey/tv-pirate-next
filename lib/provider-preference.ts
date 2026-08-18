/** Last-picked stream provider, per browser, so the picker opens where the user
 * left it. Server-side per-user prefs can replace this wholesale later. */
const KEY = 'tv-pirate:preferred-provider';

export function getPreferredProvider(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(KEY);
}

export function setPreferredProvider(provider: string) {
    localStorage.setItem(KEY, provider);
}
