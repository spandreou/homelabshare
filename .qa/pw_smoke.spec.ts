import { test, expect } from '@playwright/test';
test('home loads', async ({ page }) => {
  await page.goto('https://homelabshare.gr');
  await expect(page).toHaveTitle(/homeLabShare/i);
});
