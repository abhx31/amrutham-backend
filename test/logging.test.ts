import { describe, expect, it } from "vitest";
import type { DestinationStream } from "pino";
import { createLogger } from "../src/infrastructure/observability/logger.js";

describe("structured logging", () => {
  it("redacts authentication and session headers", () => {
    const lines: string[] = [];
    const destination: DestinationStream = {
      write(message) {
        lines.push(message);
      }
    };
    const logger = createLogger("info", destination);

    logger.info({
      req: {
        headers: {
          authorization: "Bearer access-token-secret",
          cookie: "refreshToken=refresh-token-secret",
          "x-api-key": "api-key-secret"
        }
      },
      res: { headers: { "set-cookie": "refreshToken=new-refresh-token-secret" } }
    }, "request completed");

    const output = lines.join("");
    expect(output).toContain("[REDACTED]");
    expect(output).not.toContain("access-token-secret");
    expect(output).not.toContain("refresh-token-secret");
    expect(output).not.toContain("new-refresh-token-secret");
    expect(output).not.toContain("api-key-secret");
  });
});
