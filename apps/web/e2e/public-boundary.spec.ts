import { expect, test } from '@playwright/test';

test('liveness is public and sanitized', async ({ request }) => {
  const response = await request.get('/api/health/liveness');
  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  expect(body).toMatchObject({ status: 'alive' });
  expect(JSON.stringify(body)).not.toMatch(/password|secret|database_url|access_key/i);
});

test('protected pages redirect an anonymous browser to sign in', async ({ page }) => {
  await page.goto('/breeding-ledger');
  await expect(page).toHaveURL(/\/sign-in(?:\?|$)/);
  await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible();
});

test('sign-in remains keyboard operable at every supported viewport', async ({ page }) => {
  await page.goto('/sign-in');
  await page.keyboard.press('Tab');
  const first = page.locator(':focus');
  await expect(first).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.locator(':focus')).toBeVisible();
  await expect(page.locator('body')).not.toHaveCSS('overflow-x', 'scroll');
});
