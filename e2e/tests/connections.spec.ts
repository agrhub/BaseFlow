import { test, expect } from '@playwright/test';
import { login, ensureConnection, CONNECTION } from './helpers';

test('a local repository connection is listed and parsed into classes', async ({ page }) => {
  await login(page);
  await ensureConnection(page.request);

  await page.goto('/');
  await expect(page.locator('.conn-name', { hasText: CONNECTION })).toBeVisible();

  const sidebar = await (await page.request.get(`/api/${CONNECTION}/sidebar`)).json();
  expect(sidebar.sidebar_list.src).toEqual(expect.arrayContaining(['Order', 'OrderRepository', 'OrderService']));

  const file = await page.request.get(`/api/${CONNECTION}/file-content?path=src/orders.ts`);
  expect((await file.json()).content).toContain('class OrderService');
});

test('path traversal and folders outside ALLOWED_LOCAL_ROOTS are rejected', async ({ page }) => {
  await login(page);
  await ensureConnection(page.request);

  const traversal = await page.request.get(`/api/${CONNECTION}/file-content?path=../../playwright.config.ts`);
  expect(traversal.status()).toBe(403);

  const outside = await page.request.post('/api/connections/add', {
    data: { name: 'etc', string: '/etc', options: { type: 'local' } }
  });
  expect(outside.status()).toBe(400);
});
