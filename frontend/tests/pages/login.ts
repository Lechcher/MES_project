/**
 * Login page object.
 *
 * Interacts with the sign-in form at `/signin`. Uses label-based selectors
 * since the form renders standard HTML inputs with `<label>` elements.
 */

import { BasePage } from "./base";

export class LoginPage extends BasePage {
  readonly emailInput = this.page.getByLabel("email");
  readonly passwordInput = this.page.getByLabel("password");
  readonly submitButton = this.page.getByRole("button", { name: /sign in/i });
  readonly errorMessage = this.page.getByRole("alert");

  async goto() {
    await this.gotoAndWait("/signin");
  }

  /**
   * Log in with the given email and password.
   *
   * After submitting, waits for navigation away from the sign-in page.
   */
  async login(email: string, password: string) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
    // Wait for navigation away from the sign-in page.
    await this.page.waitForURL("**/*", { timeout: 10_000 });
    await this.waitForNetworkIdle();
  }
}
