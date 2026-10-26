import { mkdir, writeFile } from "node:fs/promises";
import { openApiDocument } from "./openapi.document.js";

await mkdir("docs", { recursive: true });
await writeFile("docs/openapi.json", `${JSON.stringify(openApiDocument, null, 2)}\n`, "utf8");

console.log("Generated docs/openapi.json");
