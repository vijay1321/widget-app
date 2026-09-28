const PRODUCTION_API_URL = "https://widget-backend-1-l4lw.onrender.com";

const LOCAL_API_URL = "http://localhost:5000";

// IMPORTANT:
// Production Windows app MUST use the deployed Render backend.
const API_BASE_URL = PRODUCTION_API_URL;

// For local development only, I can manually switch to:
// const API_BASE_URL = LOCAL_API_URL;

module.exports = {
  API_BASE_URL,
  PRODUCTION_API_URL,
  LOCAL_API_URL
};
