import { test, describe } from "node:test";
import assert from "node:assert";
import { resolveDisplayFileName } from "./file-name-display";

describe("resolveDisplayFileName", () => {
  test("returns 'Untitled' for empty/missing inputs", () => {
    assert.strictEqual(resolveDisplayFileName({}), "Untitled");
    assert.strictEqual(resolveDisplayFileName({ originalName: null, storagePath: null }), "Untitled");
    assert.strictEqual(resolveDisplayFileName({ originalName: "   ", storagePath: "  " }), "Untitled");
  });

  test("uses originalName directly if it is a valid base name", () => {
    assert.strictEqual(resolveDisplayFileName({ originalName: "my_file_name.pdf" }), "my_file_name.pdf");
    assert.strictEqual(resolveDisplayFileName({ originalName: "archive.tar.gz" }), "archive.tar.gz");
    assert.strictEqual(resolveDisplayFileName({ originalName: "Report 2023.docx" }), "Report 2023.docx");
  });

  test("applies fallback formatting to originalName if it contains invalid patterns", () => {
    assert.strictEqual(resolveDisplayFileName({ originalName: "_hidden.txt" }), "Hidden.txt");
    assert.strictEqual(resolveDisplayFileName({ originalName: "file_.txt" }), "File.txt");
    assert.strictEqual(resolveDisplayFileName({ originalName: ".config" }), "Config"); // Base is empty before dot, or just .config
    // For original name: "my__file.pdf"
    assert.strictEqual(resolveDisplayFileName({ originalName: "my__file.pdf" }), "My file.pdf");
  });

  test("falls back to storagePath if originalName is missing/empty", () => {
    assert.strictEqual(
      resolveDisplayFileName({ storagePath: "uploads/1713551455123-550e8400-e29b-41d4-a716-446655440000-filename.pdf" }),
      "Filename.pdf"
    );
    assert.strictEqual(
      resolveDisplayFileName({ storagePath: "C:\\data\\uploads\\1713551455123-550e8400-e29b-41d4-a716-446655440000-file_name.pdf" }),
      "File name.pdf"
    );
    // Strips prefix even without path separators
    assert.strictEqual(
      resolveDisplayFileName({ storagePath: "1713551455123-550e8400-e29b-41d4-a716-446655440000-report.csv" }),
      "Report.csv"
    );
  });

  test("handles storagePath with invalid patterns via fallback formatting", () => {
    assert.strictEqual(
      resolveDisplayFileName({ storagePath: "uploads/1713551455123-550e8400-e29b-41d4-a716-446655440000-_hidden_file_.txt" }),
      "Hidden file.txt"
    );
  });

  test("returns 'Untitled' if storagePath fallback results in empty base", () => {
    assert.strictEqual(
      resolveDisplayFileName({ storagePath: "uploads/1713551455123-550e8400-e29b-41d4-a716-446655440000-_" }),
      "Untitled"
    );
  });
});
