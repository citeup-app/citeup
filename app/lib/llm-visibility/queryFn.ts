/**
 * Function type for querying an LLM.
 *
 * @example How to use:
 * ```ts
 * const { citations, queries } = await queryClaude("What is the capital of France?");
 * ```
 * @param query - The query to send to the LLM.
 * @param maxRetries - The maximum number of retries to attempt.
 * @param timeout - The timeout in milliseconds.
 * @returns { citations: string[]; queries: string[] } The citations and queries from the LLM response.
 */
export type QueryFn = ({
  maxRetries,
  query,
  timeout,
}: {
  maxRetries: number;
  query: string;
  timeout: number;
}) => Promise<{
  // URLs of the sources that were used to answer the query in order of
  // appearance. These are the URLs that will be used to check for visibility.
  citations: string[];
  // Extra queries that the LLM may have made to answer the query, for example
  // to search for more information.
  extraQueries: string[];
  // The response from the LLM to the query.
  text: string;
  // Token usage for the query.
  usage: {
    inputTokens?: number;
    outputTokens?: number;
  };
}>;
