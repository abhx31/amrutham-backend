import { describe, expect, it } from "vitest";
import { openApiDocument } from "../src/openapi/openapi.document.js";

describe("OpenAPI document", () => {
  it("describes the public API using OpenAPI 3.1", () => {
    expect(openApiDocument.openapi).toBe("3.1.0");
    expect(openApiDocument.servers[0]?.url).toBe("/api/v1");
    expect(Object.keys(openApiDocument.paths).length).toBeGreaterThan(30);
    expect(openApiDocument.paths).toHaveProperty("/auth/login");
    expect(openApiDocument.paths).toHaveProperty("/consultations");
    expect(openApiDocument.paths).toHaveProperty("/prescriptions/{prescriptionId}");
    expect(openApiDocument.paths).toHaveProperty("/admin/analytics/overview");
  });

  it("contains no unresolved local component references", () => {
    const serialized = JSON.stringify(openApiDocument);
    const references = [...serialized.matchAll(/"\$ref":"#\/components\/(schemas|responses)\/([^\"]+)"/g)];

    expect(references.length).toBeGreaterThan(0);
    for (const match of references) {
      const section = match[1] as "schemas" | "responses";
      const name = match[2] as keyof (typeof openApiDocument.components)[typeof section];
      expect(openApiDocument.components[section], `missing ${section}/${String(name)}`).toHaveProperty(String(name));
    }
  });
});
