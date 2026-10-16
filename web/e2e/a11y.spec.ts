import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { email, signInAdmin, signUpInDialog } from './helpers';

async function expectNoViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
}

test('board pages meet WCAG 2.2 AA', async ({ page }) => {
  await page.goto('/feedback');
  await page.getByRole('button', { name: 'Suggest something' }).first().click();
  await signUpInDialog(page, email('ada'));
  await page.getByLabel('Title').fill(`Accessible idea ${Date.now()}`);
  await page.getByPlaceholder(/What would it help/).fill('Checking contrast and names.');
  await page.getByRole('button', { name: 'Send' }).click();
  await page.waitForURL(/\/feedback\/\w+/);
  await expect(page.getByText('Your dot')).toBeVisible();
  await expectNoViolations(page);
  await page.goto('/feedback');
  await expect(page.locator('article.lt-card').first()).toBeVisible();
  await expectNoViolations(page);
});

test('dashboard pages meet WCAG 2.2 AA', async ({ page }) => {
  await page.goto('/dashboard/login');
  await expectNoViolations(page);
  await signInAdmin(page);
  await expect(page.locator('a.rq-row').first()).toBeVisible();
  await expectNoViolations(page);
  await page.locator('a.rq-row').first().click();
  await expect(page.getByRole('toolbar', { name: 'Triage' })).toBeVisible();
  await expectNoViolations(page);
  await page.goto('/dashboard/settings');
  await expect(page.getByText('App logo')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Move Features' })).toBeVisible();
  await expectNoViolations(page);
  // Confirmations are dialogs too.
  await page.getByRole('button', { name: 'Delete Features' }).click();
  await expect(page.getByRole('dialog', { name: 'Delete Features?' })).toBeVisible();
  await expectNoViolations(page);
  await page.getByRole('button', { name: 'Keep it' }).click();
});
