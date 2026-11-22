/**
 * Email-change confirmation form — the completed-change handoff.
 *
 * The confirmation itself is the library's; the behavior this form owns is
 * what happens after it: the done state shows and the signed-in viewer is
 * refreshed so the shell shows the new address.
 */

import { describe, expect, test } from "bun:test";
import { completeConfirmation } from "./confirm-email-form";

describe("completeConfirmation", () => {
  test("marks the form done and then refreshes the viewer", async () => {
    const calls: string[] = [];
    let done = false;

    await completeConfirmation(
      () => {
        calls.push("done");
        done = true;
      },
      async () => {
        // The done state must be set before the refresh runs, so a failure
        // to refresh cannot leave the visitor on the unconfirmed form.
        expect(done).toBe(true);
        calls.push("refresh");
      },
    );

    expect(calls).toEqual(["done", "refresh"]);
  });

  test("a refresh failure leaves the form marked done", async () => {
    let done = false;
    await expect(
      completeConfirmation(
        () => {
          done = true;
        },
        async () => {
          throw new Error("network");
        },
      ),
    ).rejects.toThrow("network");
    expect(done).toBe(true);
  });
});
