import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

// Runs against the real built app and SDK. API fixtures stay inside this browser:
// no synthetic listing or user is written to production.
const base = 'http://127.0.0.1:4185';
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', '4185'], { cwd: new URL('../web/', import.meta.url), stdio: 'ignore' });
let browser;
try {
  for (let i = 0; i < 100; i++) {
    if (await fetch(base).then((r) => r.ok).catch(() => false)) break;
    if (i === 99) throw new Error('Preview did not start');
    await new Promise((r) => setTimeout(r, 100));
  }
  browser = await chromium.launch();
  const user = { id: 'test-user', login: 'neighbour', avatarUrl: null, roles: ['user'] };
  const photoId = '12345678-1234-1234-1234-123456789abc';
  const make = (id, extra = {}) => ({ id, title: 'Gum beside the gate', locality: 'Brunswick, VIC', notes: 'Collect from the verge during daylight.', quantity: 'A trailer load', woodType: 'Hardwood', lat: -37.76, lon: 144.96, photoId, photoUrl: 'https://untrusted.example/tracker', expiresAt: Date.now() + 86400000, collected: false, _createdAt: Date.now(), _owner: user.id, ...extra });
  let listings = [make('active'), make('expired', { title: 'Expired pile', expiresAt: 1 }), make('collected', { title: 'Collected pile', collected: true })];
  let uploadBytes = 0, uploads = 0, deletes = 0;
  const errors = [];
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', geolocation: { latitude: -37.76, longitude: 144.96 }, permissions: ['geolocation'] });
  const page = await context.newPage(); page.on('pageerror', (error) => errors.push(error.message));
  await context.route('https://api.freeappstore.online/**', async (route) => {
    const request = route.request(), url = new URL(request.url()), method = request.method();
    const json = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
    if (url.pathname === '/v1/auth/me') return json(user);
    if (url.pathname.endsWith('/db/listings')) {
      if (method === 'POST') { const data = JSON.parse(request.postData()); listings.push(make('new-post', data)); return json({ ...data, id: 'new-post' }, 201); }
      return json({ documents: listings, total: listings.length });
    }
    if (url.pathname.includes('/db/listings/')) {
      const id = url.pathname.split('/').pop();
      if (method === 'PUT') { const patch = JSON.parse(request.postData()); listings = listings.map((x) => x.id === id ? { ...x, ...patch } : x); return json({ id, ...patch }); }
      if (method === 'DELETE') { listings = listings.filter((x) => x.id !== id); return route.fulfill({ status: 204 }); }
    }
    if (url.pathname.endsWith('/photos') && method === 'POST') {
      const data = request.postDataBuffer(); uploadBytes = data.length; uploads++;
      assert.equal(url.searchParams.get('visibility'), 'public');
      assert.equal(data[0], 255); assert.equal(data[1], 216);
      assert.ok(data.length <= 200000);
      return json({ id: photoId, url: `/v1/apps/firewood/photos/${photoId}`, expiresAt: Date.now() + 90 * 86400000, visibility: 'public', width: 640, height: 480, bytes: data.length, contentType: 'image/jpeg' }, 201);
    }
    if (url.pathname.includes('/photos/') && method === 'DELETE') { deletes++; return route.fulfill({ status: 204 }); }
    if (url.pathname.includes('/photos/')) return route.fulfill({ status: 404 });
    return json({});
  });
  // Anonymous discovery is public, hides unavailable listings and never loads arbitrary photo URLs.
  const external = []; page.on('request', (request) => { if (request.url().includes('untrusted.example')) external.push(request.url()); });
  await page.goto(base); await page.getByRole('heading', { name: 'Gum beside the gate' }).waitFor();
  assert.equal(await page.getByRole('heading', { name: 'Expired pile' }).count(), 0);
  assert.equal(await page.getByRole('heading', { name: 'Collected pile' }).count(), 0);
  await page.getByRole('button', { name: 'Near me' }).click();
  await page.getByText('1 spot within 25 km').waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.getByRole('button', { name: 'Map', exact: true }).click();
  await page.getByRole('region', { name: 'Available firewood locations' }).waitFor();
  await page.screenshot({ path: '/tmp/firewood-mobile-list.png', fullPage: true });
  // Sign-in gate, then real browser image compression, posting and owner actions.
  await page.goto(`${base}/post`); await page.getByRole('heading', { name: 'Join your local wood pile.' }).waitFor();
  await page.evaluate((value) => localStorage.setItem('fas:session', JSON.stringify({ token: 'synthetic', user: value })), user);
  await page.reload(); await page.getByLabel('Listing title').waitFor();
  const bytes = await page.evaluate(async () => {
    const canvas = document.createElement('canvas'); canvas.width = 2400; canvas.height = 1800;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#805030'; ctx.fillRect(0, 0, 2400, 1800);
    return Array.from(new Uint8Array(await (await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg'))).arrayBuffer()));
  });
  await page.getByLabel('Photo of the firewood').setInputFiles({ name: 'wood.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(bytes) });
  await page.getByLabel('Listing title').fill('Free wood from our fallen tree');
  await page.getByLabel('Suburb / town').fill('Brunswick, VIC');
  await page.getByRole('button', { name: 'Use my current location' }).click();
  await page.waitForFunction(() => document.querySelector('input[min="-90"]')?.value === '-37.76');
  await page.getByLabel('Latitude', { exact: true }).inputValue().then((value) => assert.equal(Number(value), -37.76));
  await page.getByLabel('Pickup notes').fill('On the verge, take what you need during daylight.');
  await page.screenshot({ path: '/tmp/firewood-mobile-post.png', fullPage: true });
  await page.getByRole('button', { name: 'Post free wood →' }).click();
  await page.getByRole('heading', { name: 'Your wood, shared.' }).waitFor();
  const card = page.locator('article').filter({ has: page.getByRole('heading', { name: 'Free wood from our fallen tree' }) });
  await card.getByRole('button', { name: 'Mark collected' }).click();
  await card.getByText('Collected', { exact: true }).waitFor();
  assert.equal(listings.find((x) => x.id === 'new-post').collected, true);
  await page.waitForTimeout(100);
  assert.ok(deletes >= 1);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(base); await page.getByRole('heading', { name: 'Gum beside the gate' }).waitFor();
  await page.screenshot({ path: '/tmp/firewood-desktop.png', fullPage: true });
  await page.emulateMedia({ colorScheme: 'dark' });
  assert.equal(external.length, 0); assert.deepEqual(errors, []);
  console.log(JSON.stringify({ result: 'passed', journeys: ['public discovery', 'expiry and collected filters', 'nearby search', 'map', 'signed-out gate', 'camera-size compression', 'public post', 'owner marks collected', 'mobile and desktop layout'], uploads, uploadBytes, deletes }));
} finally { await browser?.close(); server.kill(); }
