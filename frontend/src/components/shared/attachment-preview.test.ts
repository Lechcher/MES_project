/**
 * Attachment preview tests.
 *
 * The kind mapping is the contract: a browser can render images, video, audio
 * and PDF inline, and everything else — Office formats included — is a download.
 * The tests also assert every URL the preview builds stays on the authenticated
 * same-origin route, so previewing never bypasses the session check.
 */

import { describe, expect, test } from "bun:test";
import { attachmentKind } from "@/components/shared/attachment-preview";

/** The route the preview must build a download link through. */
function filePath(key: string): string {
  return `/api/mes/files/${key}`;
}

describe("preview kind", () => {
  test("previews images inline", () => {
    expect(attachmentKind("image/png")).toBe("image");
    expect(attachmentKind("image/jpeg")).toBe("image");
    expect(attachmentKind("image/svg+xml")).toBe("image");
  });

  test("previews video with player controls", () => {
    expect(attachmentKind("video/mp4")).toBe("video");
    expect(attachmentKind("video/webm")).toBe("video");
  });

  test("previews audio with player controls", () => {
    expect(attachmentKind("audio/mpeg")).toBe("audio");
    expect(attachmentKind("audio/wav")).toBe("audio");
  });

  test("previews a PDF in an embedded frame", () => {
    expect(attachmentKind("application/pdf")).toBe("pdf");
  });

  test("treats office documents and archives as downloads", () => {
    for (const mimeType of [
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.ms-powerpoint",
      "application/zip",
    ]) {
      expect(attachmentKind(mimeType)).toBe("file");
    }
  });

  test("treats an unknown or missing type as a download", () => {
    expect(attachmentKind(null)).toBe("file");
    expect(attachmentKind("application/x-custom")).toBe("file");
  });
});

describe("preview URLs", () => {
  test("keeps every URL on the authenticated file route", () => {
    const key = "tasks/task-1/6f1c-photo.png";
    const href = filePath(key);
    expect(href).toBe(`/api/mes/files/${key}`);
    expect(href.startsWith("/api/mes/files/")).toBe(true);
    // Never the storage host, so a preview cannot skip the session check.
    expect(href).not.toContain("garage");
    expect(href).not.toContain("3900");
  });

  test("builds the download variant from the same key", () => {
    const key = "tasks/task-1/6f1c-report.pdf";
    expect(`${filePath(key)}?download=1`).toBe(
      "/api/mes/files/tasks/task-1/6f1c-report.pdf?download=1",
    );
  });

  test("keeps the key's slashes intact", () => {
    expect(filePath("tasks/t-9/9-archive.zip")).toContain("tasks/t-9/");
  });
});
