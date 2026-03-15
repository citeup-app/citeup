// app/lib/openapi.ts
import {
  OpenAPIRegistry,
  OpenApiGeneratorV31,
} from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { RunDetailSchema, RunsSchema, SiteSchema } from "~/lib/api/schemas";

const registry = new OpenAPIRegistry();

registry.registerComponent("securitySchemes", "BearerAuth", {
  type: "http",
  scheme: "bearer",
  description: "Per-user API key from your profile page",
});

registry.registerPath({
  method: "get",
  path: "/api/sites/{domain}",
  summary: "Get site details",
  description: "Returns site metadata and the list of users with access.",
  security: [{ BearerAuth: [] }],
  request: {
    params: z.object({
      domain: z.string().openapi({ example: "example.com" }),
    }),
  },
  responses: {
    200: {
      description: "Site details with users",
      content: { "application/json": { schema: SiteSchema } },
    },
    401: { description: "Unauthorized — missing or invalid API key" },
    403: {
      description: "Forbidden — API key does not have access to this site",
    },
    404: { description: "Site not found" },
  },
});

registry.registerPath({
  method: "get",
  path: "/api/sites/{domain}/runs",
  summary: "List citation runs",
  description:
    "Returns all citation runs for a site, newest first. Use `?since=<ISO date>` to filter.",
  security: [{ BearerAuth: [] }],
  request: {
    params: z.object({
      domain: z.string().openapi({ example: "example.com" }),
    }),
    query: z.object({
      since: z.string().datetime().optional().openapi({
        example: "2024-01-01T00:00:00.000Z",
        description: "Return only runs created after this ISO 8601 timestamp",
      }),
    }),
  },
  responses: {
    200: {
      description: "List of citation runs",
      content: { "application/json": { schema: RunsSchema } },
    },
    401: { description: "Unauthorized" },
    403: { description: "Forbidden" },
    404: { description: "Site not found" },
  },
});

registry.registerPath({
  method: "get",
  path: "/api/sites/{domain}/runs/{runId}",
  summary: "Get run detail",
  description: "Returns a single citation run with all queries and citations.",
  security: [{ BearerAuth: [] }],
  request: {
    params: z.object({
      domain: z.string().openapi({ example: "example.com" }),
      runId: z.string().openapi({ example: "clxyz456" }),
    }),
  },
  responses: {
    200: {
      description: "Run detail with queries and citations",
      content: { "application/json": { schema: RunDetailSchema } },
    },
    401: { description: "Unauthorized" },
    403: { description: "Forbidden" },
    404: { description: "Run not found" },
  },
});

export function generateOpenApiSpec() {
  const generator = new OpenApiGeneratorV31(registry.definitions);
  return generator.generateDocument({
    openapi: "3.1.0",
    info: {
      title: "cite.me.in Monitoring API",
      version: "1.0.0",
      description:
        "Monitor your brand's visibility in AI-generated responses. Authenticate with your API key from the profile page.",
    },
    servers: [{ url: "https://cite.me.in" }],
  });
}
