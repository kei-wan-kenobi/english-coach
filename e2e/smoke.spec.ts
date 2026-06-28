import { test, expect } from "@playwright/test";

const CHARACTER = { role: "img" as const, name: "えいごの先生" };

test("landing shows the title, character, and start button", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "えいごコーチ" })).toBeVisible();
  await expect(page.getByRole(CHARACTER.role, { name: CHARACTER.name })).toBeVisible();
  await expect(page.getByRole("button", { name: "はじめる" })).toBeVisible();
  await page.screenshot({ path: "test-results/landing.png" });
});

test("the start button is keyboard focusable", async ({ page }) => {
  await page.goto("/");
  const button = page.getByRole("button", { name: "はじめる" });
  await button.focus();
  await expect(button).toBeFocused();
});

test("each expression renders in demo mode", async ({ page }) => {
  for (const expression of ["speaking", "listening", "waiting", "celebrating"]) {
    await page.goto(`/?demo=${expression}`);
    await expect(page.locator(".character")).toHaveAttribute(
      "data-expression",
      expression,
    );
  }
});

const breakpoints = [320, 768, 1024, 1440];
for (const width of breakpoints) {
  test(`renders the speaking character without overflow at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/?demo=speaking");

    const character = page.locator(".character");
    await expect(character).toBeVisible();
    await expect(character).toHaveAttribute("data-mouth", "moving");

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflow).toBe(false);

    await page.screenshot({ path: `test-results/character-${width}.png` });
  });
}
