import { expect, test } from '@playwright/test';

import { signInAdmin } from './helpers';

test('changing the primary colour rebrands the board', async ({ page }) => {
  await signInAdmin(page);
  await page.getByRole('link', { name: 'Settings' }).click();
  await page.getByRole('radio', { name: 'Ocean' }).click();
  await expect(page.getByText('Colour updated')).toBeVisible();
  await page.goto('/feedback');
  await expect
    .poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--primary').trim()))
    .toBe('#2563eb');
  // Put it back for the other project.
  await page.goto('/dashboard/settings');
  await page.getByRole('radio', { name: 'Pink' }).click();
  await expect(page.getByText('Colour updated')).toBeVisible();
});

test('boards and tags can be added, renamed and removed', async ({ page }) => {
  const board = `Ideas ${test.info().project.name} ${Date.now()}`;
  await signInAdmin(page);
  await page.goto('/dashboard/settings');
  await page.getByLabel('New board name').fill(board);
  await page.getByRole('button', { name: 'Add board' }).click();
  await expect(page.getByText(`Added ${board}`)).toBeVisible();
  // Deleting asks first, and keeping it changes nothing.
  await page.getByRole('button', { name: `Delete ${board}` }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Keep it' }).click();
  await expect(page.getByRole('textbox', { name: 'Board name', exact: true }).last()).toHaveValue(board);
  await page.getByRole('button', { name: `Delete ${board}` }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText(`Deleted ${board}`)).toBeVisible();

  const tag = `tag-${Date.now()}`;
  await page.getByLabel('New tag').fill(tag);
  await page.getByRole('button', { name: 'Add tag' }).click();
  await expect(page.getByText(`Added ${tag}`)).toBeVisible();
  await page.getByRole('button', { name: `Delete ${tag}` }).click();
  await expect(page.getByRole('dialog')).toContainText('comes off every request');
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText(`Deleted ${tag}`)).toBeVisible();
});

test('an admin invites a teammate who sets a password and signs in', async ({ page, browser }) => {
  const invitee = `sofia-${Date.now()}@driftnote.app`;
  await signInAdmin(page);
  await page.goto('/dashboard/settings');
  await page.getByLabel('Email to invite').fill(invitee);
  await page.getByRole('button', { name: 'Invite an admin' }).click();
  const link = await page.locator('#team code').textContent();
  expect(link).toContain('/dashboard/invite?token=');

  const other = await browser.newPage();
  await other.goto(link!);
  await other.getByLabel('Password').fill('anothergoodpassword');
  await other.getByRole('button', { name: 'Set password' }).click();
  await other.waitForURL(/\/dashboard\/login/);
  await other.getByLabel('Email').fill(invitee);
  await other.getByLabel('Password').fill('anothergoodpassword');
  await other.getByRole('button', { name: 'Sign in' }).click();
  await other.waitForURL(/\/dashboard\/requests/);
  await other.close();

  await page.reload();
  await page.getByRole('button', { name: 'Remove' }).last().click();
  await page.getByRole('dialog').getByRole('button', { name: 'Remove' }).click();
  await expect(page.getByText(/is no longer an admin/)).toBeVisible();
});
