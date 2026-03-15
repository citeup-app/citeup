import { generateOpenApiSpec } from "~/lib/api/openapi";

export async function loader() {
  return Response.json(generateOpenApiSpec());
}
