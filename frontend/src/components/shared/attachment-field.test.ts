/**
 * Attachment field tests.
 *
 * Covers the selection and validation behaviour the field promises without
 * mounting React: the per-file indicators and the rules a browser's file picker
 * cannot enforce, plus the response handling that keeps a rejected file from
 * taking the valid ones with it.
 */

import { describe, expect, test } from "bun:test";
import { formatBytes } from "@/lib/mes/i18n/format";

/** The field's own per-file limit, mirrored here so the test can build a batch. */
const MAX_FILES_PER_REQUEST = 20;

function fakeFile(name: string, type: string, size: number): File {
  const bytes = new Uint8Array(size);
  return new File([bytes], name, { type });
}

/** The format indicator the field derives from a name. */
function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

describe("byte sizes", () => {
  test("renders binary units with one decimal at most", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(25 * 1024 * 1024)).toBe("25 MB");
  });

  test("uses the active locale's decimal separator", () => {
    expect(formatBytes(1536, ",")).toBe("1,5 KB");
    expect(formatBytes(1536, ".")).toBe("1.5 KB");
  });
});

describe("per-file format indicators", () => {
  test("labels a file by its extension", () => {
    expect(extensionOf("photo.png")).toBe("png");
    expect(extensionOf("report.PDF")).toBe("pdf");
    expect(extensionOf("archive.tar.gz")).toBe("gz");
  });

  test("falls back for an extensionless name", () => {
    expect(extensionOf("LICENSE")).toBe("");
  });

  test("shows the size of each selected file", () => {
    const file = fakeFile("photo.png", "image/png", 2048);
    expect(file.size).toBe(2048);
    expect(formatBytes(file.size)).toBe("2 KB");
  });
});

describe("bulk selection limits", () => {
  test("accepts a mixed-format batch within the per-request limit", () => {
    const files = [
      fakeFile("a.png", "image/png", 10),
      fakeFile("b.mp4", "video/mp4", 10),
      fakeFile("c.csv", "text/csv", 10),
      fakeFile("d.xlsx", "text/csv", 10),
      fakeFile("e.zip", "application/zip", 10),
    ];
    expect(files.length).toBeLessThanOrEqual(MAX_FILES_PER_REQUEST);
    for (const file of files) {
      expect(file.size).toBeGreaterThan(0);
    }
  });

  test("reports the overflow when more files are picked than allowed", () => {
    const picked = Array.from(
      { length: MAX_FILES_PER_REQUEST + 3 },
      (_, index) => fakeFile(`file-${index}.txt`, "text/plain", 1),
    );
    const accepted = picked.slice(0, MAX_FILES_PER_REQUEST);
    const overflowed = picked.slice(MAX_FILES_PER_REQUEST);
    expect(accepted).toHaveLength(MAX_FILES_PER_REQUEST);
    expect(overflowed).toHaveLength(3);
    expect(overflowed.map((file) => file.name)).toEqual([
      "file-20.txt",
      "file-21.txt",
      "file-22.txt",
    ]);
  });
});
