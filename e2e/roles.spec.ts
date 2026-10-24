import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  expect((await page.request.post('/api/sim/scenario/worked-example')).ok()).toBe(true);
});

test('retailer builds a campaign with a live forecast and media approves it', async ({ page }) => {
  const name = `E2E coffee break ${Date.now() % 100000}`;
  await page.goto('/retailer/campaigns?company=adv-beanvoyage');
  await page.getByTestId('new-campaign').click();
  await page.getByTestId('builder-name').fill(name);
  await expect(page.getByTestId('preview-summary')).toContainText(/Matches \d+% of the crowd/);
  await page.getByTestId('builder-save').click();
  await expect(page.getByTestId('campaign-notice')).toContainText(name);
  await expect(page.getByTestId('campaign-list')).toContainText('Pending approval');

  await page.goto('/media/approvals');
  const card = page.locator('[data-testid^="review-"]').filter({ hasText: name });
  const approve = card.locator('[data-testid^="approve-"]');
  await expect(approve).toBeDisabled();
  for (const box of await card.locator('[data-testid^="check-"]').all()) await box.check();
  await approve.click();
  await expect(page.getByTestId('approval-queue')).not.toContainText(name);

  await page.goto('/retailer/campaigns?company=adv-beanvoyage');
  const row = page.getByTestId('campaign-list').locator('tr').filter({ hasText: name });
  await expect(row).toContainText(/Active|Approved/);
});

test('airline creates a goodwill rule that shows in its rule list', async ({ page }) => {
  await page.goto('/airline/goodwill?company=XH');
  await page.getByTestId('goodwill-threshold').fill('50');
  await page.getByTestId('goodwill-save').click();
  await expect(page.getByTestId('goodwill-rules')).toContainText('Delays over 50 min');
});

test('admin sees the network and can take a screen offline from the map', async ({ page }) => {
  await page.goto('/admin');
  await expect(page.getByTestId('kpi-online')).toContainText('%');
  await expect(page.getByTestId('feed-health')).toContainText('AIDX');
  await page.getByTestId('network-map').getByTestId('map-screen-SCR-052').click();
  const panel = page.getByTestId('screen-panel');
  await panel.getByRole('button', { name: 'Take offline' }).click();
  await expect(panel).toContainText('Offline');
  await panel.getByRole('button', { name: 'Bring online' }).click();
  await expect(panel).toContainText('Online');
});

test('every role page renders in Hindi without missing keys', async ({ page }) => {
  await page.goto('/admin');
  await page.getByRole('combobox', { name: 'Language' }).selectOption('hi');
  for (const path of ['/admin/master', '/retailer/campaigns', '/media/inventory', '/airline/goodwill']) {
    // Client-side navigation keeps the chosen language
    await page.evaluate((to) => {
      window.history.pushState({}, '', to);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }, path);
    await expect(page.locator('main')).toContainText(/[ऀ-ॿ]/);
    expect(await page.locator('main').innerText()).not.toMatch(/\b(admin|retailer|media|airline|campaign)\.[a-z]+\.[a-z]/);
  }
});
