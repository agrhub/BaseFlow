import { expect, Page, APIRequestContext } from '@playwright/test';
import { PASSWORD, SAMPLE_REPO } from '../playwright.config';

export const CONNECTION = 'sample';

export async function login(page: Page) {
  await page.goto('/login');
  await page.locator('input[type=password]').fill(PASSWORD);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/$/);
}

/** Create the local sample-repo connection through the API (idempotent). */
export async function ensureConnection(request: APIRequestContext) {
  const res = await request.post('/api/connections/add', {
    data: { name: CONNECTION, string: SAMPLE_REPO, options: { type: 'local' } }
  });
  expect(res.ok(), await res.text()).toBeTruthy();
}

export async function openChat(page: Page) {
  await page.locator('.floating-chat-trigger').click();
  await expect(page.locator('.agent-chat-sidebar')).toBeVisible();
}

export async function sendChat(page: Page, text: string) {
  const input = page.locator('.agent-chat-sidebar textarea').first();
  await input.fill(text);
  await input.press('Enter');
}

export function bubbles(page: Page) {
  return page.locator('.agent-chat-sidebar .bubble-text');
}
