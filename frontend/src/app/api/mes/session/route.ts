/**
 * Same-origin session endpoint.
 *
 * The browser never sees the backend session token: this handler stores it in
 * an httpOnly, sameSite=lax cookie and returns only the `viewer.user` shape the
 * UI needs. `POST` signs in, `GET` restores the session, `DELETE` signs out.
 */

import { cookies } from "next/headers";
import {
  callBackendGraphQL,
  MES_LOGIN_MUTATION,
  MES_LOGOUT_MUTATION,
  MES_SERVER_VIEWER_QUERY,
  MES_SESSION_COOKIE,
  type MesLoginResult,
  type MesViewerQueryResult,
} from "@/lib/mes/server";

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

function errorResponse(
  code: string,
  message: string,
  status: number,
): Response {
  return json({ error: { code, message } }, status);
}

/** Map a GraphQL error code onto the HTTP status the client expects. */
function statusForErrorCode(code: string | null): number {
  switch (code) {
    case "UNAUTHENTICATED":
      return 401;
    case "FORBIDDEN":
      return 403;
    case "VALIDATION_FAILED":
      return 400;
    default:
      return 500;
  }
}

async function readSessionToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(MES_SESSION_COOKIE)?.value ?? null;
}

export async function POST(request: Request): Promise<Response> {
  let payload: { identifier?: unknown; password?: unknown };
  try {
    payload = (await request.json()) as {
      identifier?: unknown;
      password?: unknown;
    };
  } catch {
    return errorResponse(
      "VALIDATION_FAILED",
      "A JSON body with an identifier and password is required.",
      400,
    );
  }

  const identifier =
    typeof payload.identifier === "string" ? payload.identifier.trim() : "";
  const password = typeof payload.password === "string" ? payload.password : "";
  if (identifier === "" || password === "") {
    return errorResponse(
      "VALIDATION_FAILED",
      "An identifier and password are required.",
      400,
    );
  }

  // An identifier carrying an "@" is an email address; anything else is read
  // as a user code. Neither form is validated here, so a wrong guess fails
  // exactly like a wrong password rather than revealing which accounts exist.
  const identifyingField = identifier.includes("@")
    ? ({ email: identifier } as const)
    : ({ userCode: identifier } as const);

  const result = await callBackendGraphQL<MesLoginResult>({
    query: MES_LOGIN_MUTATION,
    variables: { input: { ...identifyingField, password } },
    operationName: "Login",
  });

  if (!result.ok || !result.data?.login) {
    const code = result.errorCode ?? "INTERNAL";
    const message =
      result.errorMessage ??
      (code === "UNAUTHENTICATED" ? "Invalid credentials." : "Sign-in failed.");
    return errorResponse(code, message, statusForErrorCode(code));
  }

  const { session, viewer } = result.data.login;
  const store = await cookies();
  store.set(MES_SESSION_COOKIE, session.token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    expires: new Date(session.expiresAt),
  });

  return json({ viewer: viewer.user });
}

export async function GET(): Promise<Response> {
  const token = await readSessionToken();
  if (!token) return json({ viewer: null });

  const result = await callBackendGraphQL<MesViewerQueryResult>({
    query: MES_SERVER_VIEWER_QUERY,
    operationName: "Viewer",
    token,
  });

  // A stale or expired token is cleared so the browser stops sending it.
  if (!result.ok && result.errorCode === "UNAUTHENTICATED") {
    const store = await cookies();
    store.delete(MES_SESSION_COOKIE);
    return json({ viewer: null });
  }

  return json({ viewer: result.data?.viewer?.user ?? null });
}

export async function DELETE(): Promise<Response> {
  const token = await readSessionToken();
  if (token) {
    await callBackendGraphQL({
      query: MES_LOGOUT_MUTATION,
      operationName: "Logout",
      token,
    });
  }

  const store = await cookies();
  store.delete(MES_SESSION_COOKIE);
  return json({ viewer: null });
}
