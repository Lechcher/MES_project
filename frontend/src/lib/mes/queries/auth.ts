/**
 * Public authentication operations.
 *
 * Both operations are reachable without a session, which is why the reset route
 * can live outside the authenticated app shell. They are declared here rather
 * than beside the authenticated module queries because they share neither scope
 * nor readers.
 */

/**
 * Minimum password length for a self-service reset.
 *
 * Deliberately the same rule the administrative reset enforces in the backend
 * (`setUserPassword`), so a password accepted there is accepted here.
 */
export const MIN_PASSWORD_LENGTH = 8;

/**
 * The policy message for a candidate password, or `null` when it conforms.
 *
 * Kept free of rendering so the rule is testable on its own: the form reports the
 * returned message without issuing a request the server would reject anyway.
 */
export function passwordPolicyError(password: string): string | null {
  return password.length < MIN_PASSWORD_LENGTH
    ? `Choose a password of at least ${MIN_PASSWORD_LENGTH} characters.`
    : null;
}

/**
 * Whether a failed reset means the link is unusable.
 *
 * An invalid or expired token is reported distinctly so the visitor is offered a
 * new link instead of a generic failure.
 */
export function isInvalidResetToken(
  error: { code?: string; details?: unknown } | null | undefined,
): boolean {
  if (error?.code !== "VALIDATION_FAILED") return false;
  const details = error.details as { reason?: unknown } | undefined;
  return details?.reason === "INVALID_TOKEN";
}

export const REQUEST_PASSWORD_RESET = /* GraphQL */ `
  mutation RequestPasswordReset($email: String!) {
    requestPasswordReset(email: $email)
  }
`;

export const RESET_PASSWORD = /* GraphQL */ `
  mutation ResetPassword($input: ResetPasswordInput!) {
    resetPassword(input: $input)
  }
`;
