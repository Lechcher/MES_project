/**
 * Export-artifact backend hop tests.
 *
 * The proxy is the delivery path for every generated artifact, so the
 * properties under test are the credential transfer and the failure shape:
 * the session token must reach the backend as a Bearer header, the URL must
 * address the backend's own route (not the frontend's), an unreachable
 * backend must become an explicit 502, and the upstream's own statuses must
 * pass through untouched.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { MES_EXPORTS_URL } from "@/lib/mes/server";
import { fetchExportArtifact } from "./export-download";

const originalFetch = globalThis.fetch;

/** Capture the last fetch call and control its response. */
let lastCall: { url: string; init: RequestInit } | null = null;
let nextResponse: Response | (() => never);

beforeEach(() => {
  lastCall = null;
  nextResponse = new Response("ok", { status: 200 });
  globalThis.fetch = ((url: string, init: RequestInit) => {
    lastCall = { url, init };
    return typeof nextResponse === "function"
      ? nextResponse()
      : Promise.resolve(nextResponse);
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("fetchExportArtifact", () => {
  test("attaches the session token as a Bearer header", async () => {
    const response = await fetchExportArtifact("artifact-1", "token-abc");
    expect(response.status).toBe(200);
    expect(lastCall?.init.headers).toMatchObject({
      authorization: "Bearer token-abc",
    });
  });

  test("addresses the backend download route, not the proxy path", async () => {
    await fetchExportArtifact("artifact-1", "token-abc");
    expect(lastCall?.url).toBe(`${MES_EXPORTS_URL}/artifact-1`);
    expect(lastCall?.url.startsWith("http")).toBe(true);
  });

  test("percent-encodes the id segment when forwarding", async () => {
    await fetchExportArtifact("id with space/and-slash", "token-abc");
    expect(lastCall?.url).toBe(
      `${MES_EXPORTS_URL}/id%20with%20space%2Fand-slash`,
    );
  });

  test("omits the authorization header without a session token", async () => {
    await fetchExportArtifact("artifact-1", null);
    expect(lastCall?.init.headers).not.toHaveProperty("authorization");
  });

  test("returns the upstream response verbatim", async () => {
    nextResponse = new Response("bytes", {
      status: 200,
      headers: {
        "content-type": "application/vnd.ms-excel",
        "content-disposition": 'attachment; filename="task-list.xlsx"',
      },
    });
    const response = await fetchExportArtifact("artifact-1", "token-abc");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "application/vnd.ms-excel",
    );
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="task-list.xlsx"',
    );
    expect(await response.text()).toBe("bytes");
  });

  test("relays the backend's own rejection statuses", async () => {
    for (const status of [401, 404, 410]) {
      nextResponse = new Response("denied", { status });
      const response = await fetchExportArtifact("artifact-1", null);
      expect(response.status).toBe(status);
    }
  });

  test("turns an unreachable backend into a 502 error payload", async () => {
    nextResponse = () => {
      throw new Error("connect ECONNREFUSED");
    };
    const response = await fetchExportArtifact("artifact-1", "token-abc");
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      errors: [
        {
          message: "Unable to reach the MES API.",
          extensions: { code: "INTERNAL" },
        },
      ],
    });
  });
});
