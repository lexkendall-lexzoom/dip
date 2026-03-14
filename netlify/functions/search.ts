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
    if (error instanceof SearchDataLoadError) {
      console.error("[search] dataset load failed", {
        message: error.message,
        diagnostics: error.details,
      });
      return json(500, {
        error: "SEARCH_DATA_LOAD_FAILED",
        message: "Search dataset could not be loaded.",
      });
    }

    console.error("[search] request failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return json(500, {
      error: "SEARCH_INTERNAL_ERROR",
      message: "Search request failed.",
    });
  }
};
