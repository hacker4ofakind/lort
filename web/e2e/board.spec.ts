import { expect, test } from '@playwright/test';

import { email, signUpInDialog } from './helpers';

test('a visitor signs up, suggests an idea, comments and votes', async ({ page }) => {
  const title = `Dark mode ${test.info().project.name} ${Date.now()}`;
  await page.goto('/feedback');
  await expect(page.getByRole('heading', { name: 'Got an idea for Driftnote?' })).toBeVisible();

  await page.getByRole('button', { name: 'Suggest something' }).first().click();
  await signUpInDialog(page, email('mara'));
  await page.getByLabel('Title').fill(title);
  await page.getByRole('button', { name: 'editor' }).click();
  await page.getByPlaceholder(/What would it help/).fill('Writing at night is rough on the eyes.');
  await page.getByRole('button', { name: 'Send' }).click();

  await page.waitForURL(/\/feedback\/\w+/);
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  await expect(page.getByText('Your dot')).toBeVisible();

  await page.getByPlaceholder(/Add a comment/).fill('Same on iOS!');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText('Same on iOS!')).toBeVisible();
  await expect(page.getByRole('heading', { name: '1 comment' })).toBeVisible();

  // Authors can take back what they wrote, after a confirmation.
  await page.getByPlaceholder(/Add a comment/).fill('Typo, ignore me');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByRole('heading', { name: '2 comments' })).toBeVisible();
  await page.getByRole('button', { name: 'Delete your comment “Typo, ignore me”' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText('Comment deleted')).toBeVisible();
  await expect(page.getByText('Typo, ignore me')).toBeHidden();
  await expect(page.getByRole('heading', { name: '1 comment' })).toBeVisible();

  await page.getByRole('link', { name: 'All ideas' }).click();
  const sticker = page.getByRole('button', { name: new RegExp(`Remove your upvote from ${title}`) });
  await expect(sticker).toHaveAttribute('aria-pressed', 'true');
  await sticker.click();
  await expect(page.getByRole('button', { name: new RegExp(`Upvote ${title}, 0 votes`) })).toBeVisible();
});

test('ideas on an approval board wait for the team', async ({ page }) => {
  const title = `Crash on paste ${test.info().project.name} ${Date.now()}`;
  await page.goto('/feedback');
  await page.getByRole('button', { name: 'Suggest something' }).first().click();
  await signUpInDialog(page, email('priya'));
  await page.getByRole('radio', { name: 'Bugs' }).click();
  await page.getByLabel('Title').fill(title);
  await page.getByPlaceholder(/What would it help/).fill('The app closes when I paste a long screenshot.');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText('The team will check it before it shows on the board.')).toBeVisible();
  await page.waitForURL(/\/feedback\/\w+/);
  await expect(page.getByText(/Waiting for approval/)).toBeVisible();

  // Someone else can't see it.
  const url = page.url();
  await page.context().clearCookies();
  await page.evaluate(() => localStorage.clear());
  await page.goto(url);
  await expect(page.getByText('This idea isn’t here')).toBeVisible();
});
