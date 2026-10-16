import { expect, test } from '@playwright/test';

import { email, signInAdmin, signUpInDialog } from './helpers';

// A 1×1 PNG, enough for PocketBase to accept it as an image.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

test('an admin triages a request through to completed, with undo', async ({ page, browser }) => {
  // A visitor posts something first.
  const visitor = await browser.newPage();
  const title = `Export as Markdown ${test.info().project.name} ${Date.now()}`;
  await visitor.goto('/feedback');
  await visitor.getByRole('button', { name: 'Suggest something' }).first().click();
  await signUpInDialog(visitor, email('devon'));
  await visitor.getByLabel('Title').fill(title);
  await visitor.getByPlaceholder(/What would it help/).fill('One click to download everything as .md files.');
  await visitor.getByRole('button', { name: 'Send' }).click();
  await visitor.waitForURL(/\/feedback\/\w+/);
  await visitor.getByPlaceholder(/Add a comment/).fill('PDF would be nice too');
  await visitor.getByRole('button', { name: 'Send' }).click();
  await expect(visitor.getByText('PDF would be nice too')).toBeVisible();
  await visitor.close();

  await signInAdmin(page);
  await page.getByLabel('Search requests').fill(title);
  const row = page.getByRole('row', { name: new RegExp(title) });
  await expect(row).toContainText('New');
  await row.click();

  await page.getByRole('button', { name: 'Accept' }).click();
  await expect(page.getByText('Moved to Reviewing')).toBeVisible();
  await page.getByRole('button', { name: 'Add to roadmap' }).click();
  await expect(page.getByText('Added to the roadmap')).toBeVisible();
  await page.getByRole('button', { name: 'Start working' }).click();
  await page.getByRole('button', { name: 'Complete' }).click();
  await expect(page.getByText('Marked as completed')).toBeVisible();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('toolbar', { name: 'Triage' }).getByRole('button', { name: 'Complete' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Status: In progress. Change it' })).toBeVisible();

  // An internal note with a screenshot: the image is protected, so it loads with a file token.
  await page.getByRole('button', { name: /Visibility: Public/ }).click();
  await page.getByPlaceholder(/only the team can see/).fill('Reproduced on a Pixel 8.');
  await page.locator('input[type=file]').setInputFiles({ name: 'pixel.png', mimeType: 'image/png', buffer: PNG });
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText('Only the team sees this')).toBeVisible();
  const shot = page.locator('.lt-note img');
  await expect(shot).toBeVisible();
  await expect.poll(() => shot.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);

  // The team can delete anyone's comment.
  await page.getByRole('button', { name: /Delete .*’s comment “PDF would be nice too”/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText('Comment deleted')).toBeVisible();
  await expect(page.getByText('PDF would be nice too')).toBeHidden();

  await page
    .getByRole('button', { name: /open member menu/ })
    .first()
    .click();
  await expect(page.getByRole('button', { name: 'Copy password reset link' })).toBeVisible();
});
