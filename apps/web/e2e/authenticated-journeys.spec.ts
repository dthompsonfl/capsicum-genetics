import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const priorityRoutes = [
  '/', '/quick-genetics', '/help',
  '/germplasm', '/germplasm/new', '/seed-lots', '/plants', '/crosses', '/crosses/new',
  '/selection-plans', '/experiments', '/breeding-ledger',
  '/simulation-lab', '/simulations',
  '/phenotype-capture', '/phenotypes/images', '/annotations',
  '/research', '/research/review', '/research-assistant', '/ai',
  '/catalog', '/catalog/normalized', '/scientific-catalog',
  '/reports', '/settings/workspace', '/settings/users', '/settings/security', '/settings/sessions',
  '/admin/jobs', '/admin/audit', '/admin/models', '/admin/system',
];

test('authenticated priority routes are keyboard reachable, responsive, and axe-clean', async ({ page }) => {
  for (const route of priorityRoutes) {
    await page.goto(route);
    await expect(page).not.toHaveURL(/\/sign-in/);
    await expect(page.locator('h1').first()).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(page.locator(':focus')).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    expect(overflow, `${route} must not create horizontal viewport overflow`).toBe(false);
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(results.violations, `${route} axe violations`).toEqual([]);
  }
});

test('scientific unavailable states do not claim unsupported authority', async ({ page }) => {
  await page.goto('/simulation-lab');
  await expect(page.getByText(/unavailable|approved|authority|evidence/i).first()).toBeVisible();
  await page.goto('/phenotypes/images');
  await expect(page.getByText(/evidence, not a phenotype prediction/i)).toBeVisible();
  await page.goto('/research-assistant');
  await expect(page.locator('body')).not.toContainText(/guaranteed resistance|exact shu prediction/i);
});
