import { test, expect } from '@playwright/test';
import { login, ensureConnection, openChat, sendChat, bubbles } from './helpers';

test.beforeEach(async ({ page }) => {
  await login(page);
  await ensureConnection(page.request);
  await page.goto('/');
  await openChat(page);
});

test('the assistant answers through the default provider', async ({ page }) => {
  await sendChat(page, 'Hello there');
  await expect(bubbles(page).last()).toContainText('OpenAI reply #1 to: Hello there');
});

test('switching the model keeps the conversation context', async ({ page }) => {
  await sendChat(page, 'First question');
  await expect(bubbles(page).last()).toContainText('OpenAI reply #1');

  await page.locator('.provider-select').click();
  await page.locator('.provider-select-popper .el-select-dropdown__item', { hasText: 'Claude' }).click();
  await sendChat(page, 'Second question');
  // Claude receives both user turns
  await expect(bubbles(page).last()).toContainText('Claude reply #2 to: Second question');
});

test('reloading the page restores the conversation', async ({ page }) => {
  await sendChat(page, 'Remember me');
  await expect(bubbles(page).last()).toContainText('OpenAI reply #1');

  await page.reload();
  await openChat(page);
  await expect(bubbles(page).first()).toContainText('Remember me');
  await sendChat(page, 'Still there?');
  await expect(bubbles(page).last()).toContainText('OpenAI reply #2 to: Still there?');
});

test('saved conversations can be listed and resumed from a new tab', async ({ page, context }) => {
  await sendChat(page, 'Conversation alpha');
  await expect(bubbles(page).last()).toContainText('reply #1');

  await page.locator('.agent-chat-sidebar [title="Conversations"]').click();
  await page.locator('.new-chat-btn').click();
  await expect(bubbles(page)).toHaveCount(0);
  await sendChat(page, 'Conversation beta');
  await expect(bubbles(page).last()).toContainText('reply #1');

  const tab = await context.newPage();
  await tab.goto('/');
  await openChat(tab);
  await expect(bubbles(tab)).toHaveCount(0);
  await tab.locator('.agent-chat-sidebar [title="Conversations"]').click();
  const titles = tab.locator('.conversations-list .conversation-title');
  await expect(titles.first()).toHaveText('Conversation beta');
  await expect(titles.filter({ hasText: 'Conversation alpha' })).toHaveCount(1);

  await tab.locator('.conversations-list li', { hasText: 'Conversation alpha' }).click();
  await expect(bubbles(tab).first()).toContainText('Conversation alpha');
});
