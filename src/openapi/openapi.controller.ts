import type { Request, Response } from "express";
import { openApiDocument } from "./openapi.document.js";

export class OpenApiController {
  readonly document = (_request: Request, response: Response): void => {
    response.setHeader("Cache-Control", "public, max-age=300");
    response.json(openApiDocument);
  };

  readonly explorer = (_request: Request, response: Response): void => {
    response.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self' https://unpkg.com 'unsafe-inline'; style-src 'self' https://unpkg.com 'unsafe-inline'; img-src 'self' data:; connect-src 'self'"
    );
    response.type("html").send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Amrutam API documentation</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css">
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
    <script>
      SwaggerUIBundle({
        url: "/api/openapi.json",
        dom_id: "#swagger-ui",
        deepLinking: true,
        displayRequestDuration: true,
        persistAuthorization: true
      });
    </script>
  </body>
</html>`);
  };
}
