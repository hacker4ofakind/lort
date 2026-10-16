// Seeds the fresh stack once: two boards (Bugs needs approval), three tags, the app name.
// It also switches rate limits off: the suite signs up more people per minute than Lort allows one IP.
const BASE = 'http://localhost:4052';

async function call(path: string, token: string, method: string, body?: unknown) {
  const res = await fetch(BASE + path, {
    method,
    headers: { Authorization: token, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

export default async function globalSetup() {
  const auth = await fetch(`${BASE}/api/collections/_superusers/auth-with-password`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ identity: 'admin@example.com', password: 'correcthorse' }),
  }).then((r) => r.json());
  const token = auth.token as string;
  await call('/api/settings', token, 'PATCH', { rateLimits: { enabled: false } });
  await call('/api/collections/boards/records', token, 'POST', { name: 'Features', isPublic: true, order: 0 });
  await call('/api/collections/boards/records', token, 'POST', {
    name: 'Bugs',
    isPublic: true,
    requireApproval: true,
    order: 1,
  });
  for (const [i, name] of ['editor', 'ui', 'sync'].entries()) {
    await call('/api/collections/tags/records', token, 'POST', { name, order: i });
  }
  const settings = await call('/api/collections/settings/records', token, 'GET');
  await call(`/api/collections/settings/records/${settings.items[0].id}`, token, 'PATCH', { appName: 'Driftnote' });
}
