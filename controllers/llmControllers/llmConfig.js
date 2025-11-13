import axios from "axios";
import { Database } from "sqlite";

async function schemaUpload(db_name, db_service, schema) {
  try {
    // Validate
    if (!db_name || !db_service || !schema) {
      throw new Error("Missing required parameters: db_name, db_service or schema.");
    }

    // Prepare payload
    const db_data = {
      database: db_name,
      service: db_service,
      schema: schema
    };

    // External endpoint URL (replace with yours)
    const ENDPOINT_URL = process.env.QUERY_GENERATOR_URL || 
      "https://your-endpoint.com/api/schema/upload";

    // Send request
    const response = await axios.post(ENDPOINT_URL, db_data);

    // Ensure the external service returned a query
    if (!response.data || !response.data.query) {
      throw new Error("Invalid response from query generator service.");
    }

    return {
      success: true,
    };

  } catch (error) {
    console.error("Schema Upload Error:", error);

    return {
      success: false,
      error: error.message
    };
  }
}

async function fetchQuery(db_name, nl_query) {
  try {
    if (!db_name || !nl_query) {
      throw new Error("Database name and NL query required");
    }

    const ENDPOINT_URL =
      process.env.QUERY_GENERATOR_URL ||
      "https://your-endpoint.com/api/query";

    const payload = {
      database: db_name,
      query: nl_query
    };

    // Make POST request to external query generator
    const response = await axios.post(ENDPOINT_URL, payload);

    // Validate response
    if (!response.data || !response.data.sql_query) {
      throw new Error("Invalid response from query generator service");
    }

    // Return the SQL query
    return {
      success: true,
      sql_query: response.data.sql_query
    };

  } catch (error) {
    console.error("Query Fetch Error:", error.message);

    return {
      success: false,
      error: error.message
    };
  }
}

export { schemaUpload, fetchQuery };
