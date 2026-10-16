import { expect, test } from '@playwright/test';

import { email, signUpInDialog } from './helpers';

test('a visitor creates an account and signs back in', async ({ page }) => {
  const address = email('sam');
  await page.goto('/feedback');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('button', { name: 'Create an account' }).click();
  await signUpInDialog(page, address);
  await page.getByRole('button', { name: 'Your profile' }).click();
  await page.getByLabel('Name').fill('Sam W.');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Profile saved')).toBeVisible();

  await page.getByRole('button', { name: 'Your profile' }).click();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByLabel('Email').fill(address);
  await page.getByLabel('Password').fill('wrong password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).last().click();
  await expect(page.getByRole('alert')).toContainText('don’t match');
  await page.getByLabel('Password').fill('correcthorse');
  await page.getByRole('button', { name: 'Sign in', exact: true }).last().click();
  await expect(page.getByRole('button', { name: 'Your profile' })).toBeVisible();
});

test('the honeypot stops form-filling bots', async ({ page }) => {
  await page.goto('/feedback');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('button', { name: 'Create an account' }).click();
  await page.locator('.lt-honeypot input').fill('http://spam.example', { force: true });
  await signUpInDialog(page, email('bot'));
  await expect(page.getByRole('alert')).toContainText('Something went wrong');
});
