/**
 * Theme (appearance) page object.
 *
 * Drives the theme selector in the top navigation and reads back the theme the
 * document element actually resolved to, so a test can assert on the applied
 * palette rather than on the selector's own state.
 */

import type { Page } from "@playwright/test";
import { BasePage } from "../base";

/** The three modes the selector offers, in the order they are offered. */
export const THEME_MODES = ["Follow system", "Light", "Dark"] as const;

/** The document class the resolved theme lands on. */
export type AppliedTheme = "light" | "dark";

export class AppearancePage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  /** The selector trigger, addressed by its localized accessible name. */
  themeTrigger(locale: "en" | "vi" = "en") {
    return this.page.getByLabel(locale === "en" ? "Theme" : "Chủ đề");
  }

  /** The classes the document element currently carries. */
  async documentClasses(): Promise<string[]> {
    return this.page.evaluate(() =>
      Array.from(document.documentElement.classList),
    );
  }

  /** The theme the document element resolved to. */
  async appliedTheme(): Promise<AppliedTheme> {
    const classes = await this.documentClasses();
    return classes.includes("dark") ? "dark" : "light";
  }

  /** Choose a theme mode through the selector. */
  async selectTheme(mode: (typeof THEME_MODES)[number]) {
    await this.themeTrigger().click();
    await this.page.getByRole("option", { name: mode, exact: true }).click();
    await this.waitForNetworkIdle();
  }

  /**
   * Write the theme cookie directly, without going through the selector.
   *
   * Uses the browser context's cookie store rather than `document.cookie`:
   * a test helper has no reason to lean on the document API, and this keeps
   * the seed and the clear symmetric about the same cookie.
   */
  async setThemeCookie(mode: string) {
    await this.page
      .context()
      .addCookies([
        { name: "mes_theme", value: mode, domain: "localhost", path: "/" },
      ]);
  }

  /** Remove the stored theme cookie, so the OS preference decides. */
  async clearThemeCookie() {
    await this.page.context().clearCookies({ name: "mes_theme" });
  }

  /** The body's computed background color, a proxy for the active palette. */
  async bodyBackground(): Promise<string> {
    return this.page.evaluate(
      () => getComputedStyle(document.body).backgroundColor,
    );
  }

  /** Compare a computed color channel against the dark palette's value. */
  async canvasIsCharcoal(): Promise<boolean> {
    // #161616 in the Carbon Gray 100 dark palette.
    return (await this.bodyBackground()) === "rgb(22, 22, 22)";
  }

  /** Compare a computed color channel against the light palette's value. */
  async canvasIsWhite(): Promise<boolean> {
    return (await this.bodyBackground()) === "rgb(255, 255, 255)";
  }
}
