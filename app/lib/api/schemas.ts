// app/lib/api-schemas.ts
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

extendZodWithOpenApi(z);

export const SiteUserSchema = z
  .object({
    id: z.string().openapi({ example: "clxyz123" }),
    email: z.string().email().openapi({ example: "user@example.com" }),
    role: z.enum(["owner", "member"]).openapi({ example: "owner" }),
  })
  .openapi("SiteUser");

export const SiteSchema = z
  .object({
    domain: z.string().openapi({ example: "example.com" }),
    createdAt: z.date().openapi({ example: "2024-01-01T00:00:00.000Z" }),
    users: z.array(SiteUserSchema),
  })
  .openapi("Site");

export const RunSummarySchema = z
  .object({
    id: z.string().openapi({ example: "clxyz456" }),
    platform: z.string().openapi({ example: "chatgpt" }),
    model: z.string().openapi({ example: "gpt-4o" }),
    createdAt: z.date().openapi({ example: "2024-01-01T00:00:00.000Z" }),
    queryCount: z.number().int().openapi({ example: 5 }),
    citationCount: z.number().int().openapi({ example: 12 }),
  })
  .openapi("RunSummary");

export const RunsSchema = z
  .object({ runs: z.array(RunSummarySchema) })
  .openapi("Runs");

export const QuerySchema = z
  .object({
    id: z.string().openapi({ example: "clxyz789" }),
    query: z.string().openapi({ example: "best retail platforms" }),
    group: z.string().openapi({ example: "retail" }),
    position: z.number().int().nullable().openapi({ example: 1 }),
    citations: z
      .array(z.string())
      .openapi({ example: ["https://example.com/page1"] }),
  })
  .openapi("Query");

export const RunDetailSchema = z
  .object({
    id: z.string().openapi({ example: "clxyz456" }),
    platform: z.string().openapi({ example: "chatgpt" }),
    model: z.string().openapi({ example: "gpt-4o" }),
    createdAt: z.date().openapi({ example: "2024-01-01T00:00:00.000Z" }),
    queries: z.array(QuerySchema),
  })
  .openapi("RunDetail");
