const http = require('http');
const { URL } = require('url');
const {
  buildRecommendationsResponse,
  buildHealthResponse,
  buildErrorResponse,
} = require('./src/genie/mock/recommendationEngine');

const PORT = Number(process.env.PORT || 7072);
const HOST = process.env.HOST || '0.0.0.0';
const DEFAULT_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json; charset=utf-8',
};

function sendJson(res, statusCode, body) {
  res.writeHead(statusCode, DEFAULT_HEADERS);
  res.end(JSON.stringify(body, null, 2));
}

function collectQuery(searchParams) {
  return {
    age: searchParams.get('age'),
    gender: searchParams.get('gender'),
    skinType: searchParams.get('skinType'),
    concerns: searchParams.getAll('concerns').length > 0 ? searchParams.getAll('concerns') : searchParams.get('concerns'),
    preference: searchParams.get('preference'),
    brand: searchParams.get('brand'),
    minPrice: searchParams.get('minPrice'),
    maxPrice: searchParams.get('maxPrice'),
    finish: searchParams.get('finish'),
    limit: searchParams.get('limit'),
  };
}

const server = http.createServer((req, res) => {
  if (!req.url) {
    sendJson(res, 400, buildErrorResponse(400, 'Missing request URL.'));
    return;
  }

  if (req.method === 'OPTIONS') {
    res.writeHead(204, DEFAULT_HEADERS);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host || `localhost:${PORT}`}`);

  try {
    if (req.method === 'GET' && url.pathname === '/api/health') {
      sendJson(res, 200, buildHealthResponse());
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/products/recommendations') {
      const query = collectQuery(url.searchParams);
      const response = buildRecommendationsResponse(query);
      sendJson(res, 200, response);
      return;
    }

    sendJson(res, 404, buildErrorResponse(404, `Route not found: ${req.method} ${url.pathname}`));
  } catch (error) {
    sendJson(
      res,
      500,
      buildErrorResponse(500, 'Unexpected mock API failure.', error instanceof Error ? error.message : String(error))
    );
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Edgewell Sales Genie mock API listening at http://${HOST}:${PORT}`);
  console.log(`Health endpoint: http://localhost:${PORT}/api/health`);
  console.log(`Recommendations endpoint: http://localhost:${PORT}/api/products/recommendations`);
});
