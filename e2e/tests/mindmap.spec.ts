import { test, expect } from '@playwright/test';
import { login, ensureConnection, CONNECTION } from './helpers';

test('the mindmap renders and double-clicking a class opens its UML relationship dialog', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));

  await login(page);
  await ensureConnection(page.request);
  await page.goto(`/${CONNECTION}`);
  await page.locator('#tab-mindmap').click();

  const canvas = page.locator('.g6-graph-container canvas').first();
  await expect(canvas).toBeVisible();
  await page.waitForTimeout(1500); // initial layout animation

  // OrderRepository node in the default class layout (viewport fixed in playwright.config.ts)
  const box = (await canvas.boundingBox())!;
  await page.mouse.dblclick(box.x + 186, box.y + 298);

  await expect(page.locator('.erd-uml-dialog')).toBeVisible();
  await expect(page.locator('.target-card h4')).toHaveText('OrderRepository');
  await expect(page.locator('.parent-card h4')).toHaveText(['Repository']);
  await expect(page.locator('.dependent-card h4')).toHaveText(['OrderService']);
  await expect(page.locator('.erd-svg g path')).toHaveCount(2);

  expect(errors).toEqual([]);
});
