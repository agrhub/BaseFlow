import { test, expect } from '@playwright/test';
import { login } from './helpers';

test('unauthenticated visitors land on the public welcome page and the API is closed', async ({ page, request }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/welcome$/);
  const res = await request.get('/api/connections');
  expect(res.status()).toBe(401);
});

test('a wrong password is rejected and the right one signs in', async ({ page }) => {
  await page.goto('/login');
  await page.locator('input[type=password]').fill('not-the-password');
  await page.keyboard.press('Enter');
  await expect(page.locator('.el-message--error')).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);

  await login(page);
  const cookies = await page.context().cookies();
  const auth = cookies.find(c => c.name === 'baseflow.auth');
  expect(auth?.httpOnly).toBe(true);
  expect(auth?.sameSite).toBe('Lax');
});

test('the login survives a reload and logout closes the API', async ({ page }) => {
  await login(page);
  await page.reload();
  await expect(page).toHaveURL(/\/$/);
  expect((await page.request.get('/api/connections')).status()).toBe(200);

  expect((await page.request.post('/api/auth/logout')).ok()).toBeTruthy();
  expect((await page.request.get('/api/connections')).status()).toBe(401);
});

test('cross-origin state-changing requests are blocked', async ({ page }) => {
  await login(page);
  const res = await page.request.post('/api/connections/delete', {
    headers: { origin: 'https://evil.example' },
    data: { curr_config: 'anything' }
  });
  expect(res.status()).toBe(403);
});
