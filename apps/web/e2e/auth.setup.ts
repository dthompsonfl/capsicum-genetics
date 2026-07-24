import { expect, test as setup } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const authFile = path.resolve(process.cwd(), '.runtime/e2e-owner.json');
const credentials = {
  email: process.env.PLAYWRIGHT_OWNER_EMAIL ?? 'owner@capsicum.test',
  password: process.env.PLAYWRIGHT_OWNER_PASSWORD ?? 'Orchard-Quartz-47-Canopy!',
};

setup('provision one authenticated owner session', async ({ page }) => {
  await page.goto('/onboarding');
  const onboarding = page.getByRole('heading', { name: /create the first workspace/i });
  if (await onboarding.isVisible().catch(() => false)) {
    const installationToken = process.env.PLAYWRIGHT_BOOTSTRAP_TOKEN;
    if (!installationToken) throw new Error('PLAYWRIGHT_BOOTSTRAP_TOKEN is required for a clean E2E database.');
    await page.getByLabel('Installation token').fill(installationToken);
    await page.getByLabel('Your name').fill('Capsicum Test Owner');
    await page.getByLabel('Email').fill(credentials.email);
    await page.getByLabel('Workspace name').fill('Capsicum Research Test');
    await page.getByLabel('Workspace web name').fill('capsicum-research-test');
    await page.getByLabel('Owner password').fill(credentials.password);
    await page.getByRole('button', { name: /create governed workspace/i }).click();
    await page.waitForURL((url) => !url.pathname.includes('/onboarding'));
  } else {
    await page.goto('/sign-in');
    await page.getByLabel('Email').fill(credentials.email);
    await page.getByLabel('Password').fill(credentials.password);
    await page.getByRole('button', { name: /^sign in$/i }).click();
    await page.waitForURL((url) => !url.pathname.includes('/sign-in'));
  }
  await expect(page.locator('body')).not.toContainText(/invalid email or password/i);
  await mkdir(path.dirname(authFile), { recursive: true });
  await page.context().storageState({ path: authFile });
});
