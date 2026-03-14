import { searchVenues } from "../../lib/search/searchVenues.ts";
import { SearchDataLoadError } from "../../lib/search/loadSearchData.ts";

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

  try {
    const response = searchVenues(query);
    return json(200, response);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    if (error instanceof SearchDataLoadError) {
      console.error("[search] dataset load failed", {
        query,
        message: error.message,
        diagnostics: error.details,
        stack: errorStack,
      });
      return json(500, {
        ok: false,
        error: "SEARCH_DATA_LOAD_FAILED",
        message: "Search dataset could not be loaded.",
        query,
        intent: null,
        results: [],
      });
    }

    console.error("[search] request failed", {
      query,
      error: errorMessage,
      stack: errorStack,
    });
    return json(500, {
      ok: false,
      error: "SEARCH_INTERNAL_ERROR",
      message: "Search request failed.",
      query,
      intent: null,
      results: [],
    });
  }
};
