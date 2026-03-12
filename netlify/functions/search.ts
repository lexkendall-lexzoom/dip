import { searchVenues } from "../../lib/search/searchVenues.ts";

const json = (statusCode: number, body: unknown) => ({
  statusCode,
  headers: { "content-type": "application/json; charset=utf-8" },
  body: JSON.stringify(body),
});

export const handler = async (event: { queryStringParameters?: Record<string, string | undefined> }) => {
  const q = event.queryStringParameters?.q;

  if (typeof q !== "string") {
    return json(400, {
      error: "Missing required query param 'q'.",
      query: "",
      intent: null,
      results: [],
    });
  }

  const query = q.trim();
  if (!query) {
    return json(400, {
      error: "Query param 'q' must not be blank.",
      query: q,
      intent: null,
      results: [],
    });
  }

  const response = searchVenues(query);
  return json(200, response);
};
