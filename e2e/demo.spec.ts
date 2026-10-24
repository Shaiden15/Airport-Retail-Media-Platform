import { expect, test, type Page } from '@playwright/test';

const SCREEN = 'SCR-052';

async function workedExample(page: Page) {
  const res = await page.request.post('/api/sim/scenario/worked-example');
  expect(res.ok()).toBe(true);
}

test.beforeEach(async ({ page }) => {
  await workedExample(page);
});

test('worked example: Gate 42 at 14:10 plays perfume and explains why', async ({ page }) => {
  await page.goto('/retailer');
  await page.getByRole('button', { name: /Worked example/ }).click();
  await expect(page).toHaveURL(/\/demo\?screen=SCR-052/);
  await expect(page.getByTestId('sim-clock')).toHaveText('14:10:00');
  await expect(page.getByTestId('creative')).toContainText('Signature scents');
  await expect(page.getByTestId('fids')).toContainText('XH501');
  await expect(page.getByTestId('qr-card').locator('svg')).toBeVisible();

  await page.getByTestId('why-button').click();
  const overlay = page.getByTestId('why-overlay');
  await expect(overlay).toBeVisible();
  await expect(page.getByTestId('winning-rule')).toContainText('XH501 delayed 45 min');
  await expect(page.getByTestId('top-candidates')).toContainText('Duty-free perfume');
  await expect(page.getByTestId('validation-checks')).toContainText('score-reproducible');
  await expect(overlay).toContainText('placement');
});

test('injected AIDX delay changes the gate screen within 2 seconds', async ({ page }) => {
  await page.goto(`/demo?screen=${SCREEN}&right=retailer&company=adv-beanvoyage`);
  await expect(page.getByTestId('creative')).toContainText('Signature scents');
  await page.getByRole('button', { name: 'Inject event' }).click();
  await page.getByLabel('Total delay (minutes)').fill('75');
  const started = Date.now();
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByTestId('creative')).toHaveAttribute('data-template', 'goodwill', { timeout: 2000 });
  expect(Date.now() - started).toBeLessThan(2000);
  await expect(page.getByTestId('inject-toast')).toContainText('screens re-planned');
  await expect(page.getByTestId('fids')).toContainText('16:10');
});

test('phone claim records a redemption the retailer sees immediately', async ({ page, browser }) => {
  await page.goto(`/demo?screen=${SCREEN}&right=retailer&company=adv-aurelle`);
  await expect(page.getByTestId('retailer-live')).toBeVisible();
  const offer = (await (await page.request.get(`/api/offers/screen/${SCREEN}`)).json()) as { url: string };
  const claimPath = new URL(offer.url).pathname;

  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const mobile = await phone.newPage();
  await mobile.goto(claimPath);
  await expect(mobile.getByTestId('claim-headline')).toContainText('Signature scents');
  await mobile.getByTestId('claim-button').click();
  const code = (await mobile.getByTestId('claim-code').first().textContent())?.trim() ?? '';
  expect(code).toMatch(/^[A-Z0-9]{8}$/);
  const claimedAt = Date.now();
  await expect(page.getByTestId('recent-redemptions')).toContainText(code, { timeout: 2000 });
  expect(Date.now() - claimedAt).toBeLessThan(2000);

  await mobile.getByTestId('share-button').click();
  await expect(mobile.getByTestId('claim-code')).toHaveCount(2);
  await mobile.reload();
  await expect(mobile.getByTestId('claim-code').first()).toHaveText(code);
  await phone.close();
});

test('kiosk route renders a single full-screen display', async ({ page }) => {
  await page.goto(`/screen/${SCREEN}`);
  await expect(page.getByTestId('screen-frame')).toHaveAttribute('data-screen', SCREEN);
  await expect(page.getByTestId('sim-bar')).toHaveCount(0);
});

test('60x simulation runs smoothly with no console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  await page.goto(`/demo?screen=${SCREEN}&right=retailer&company=adv-horizon`);
  await page.getByRole('button', { name: '60x' }).click();
  await page.getByRole('button', { name: 'Play' }).click();
  await page.waitForTimeout(5000);
  await page.getByRole('button', { name: 'Pause' }).click();
  const clock = (await page.getByTestId('sim-clock').textContent()) ?? '';
  const [h, m] = clock.split(':').map(Number);
  expect((h ?? 0) * 60 + (m ?? 0)).toBeGreaterThanOrEqual(14 * 60 + 14);
  expect(Number((await page.getByTestId('kpi-impressions').textContent())?.replace(/,/g, ''))).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});
