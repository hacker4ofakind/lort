import type { Page } from '@playwright/test';

let n = 0;

/** A unique email per test run, so tests and projects never collide. */
export function email(name: string) {
  return `${name}-${Date.now()}-${n++}@example.com`;
}

/** Signs up through the board's dialog, which opens from whatever asked for an account. */
export async function signUpInDialog(page: Page, address: string) {
  await page.getByLabel('Email').fill(address);
  await page.getByLabel('Password').fill('correcthorse');
  await page.getByRole('button', { name: 'Create account' }).click();
}

export async function signInAdmin(page: Page) {
  await page.goto('/dashboard');
  await page.waitForURL(/\/dashboard\/login/);
  await page.getByLabel('Email').fill('admin@example.com');
  await page.getByLabel('Password').fill('correcthorse');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/\/dashboard\/requests/);
}
