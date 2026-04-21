# AnimeTM

AnimeTM is a MyAnimeList (MAL) API proxy server. It serves as a backend service that fetches anime data from the MyAnimeList API, adds a layer of caching, normalizes the data, and avoids exposing the MAL Client ID to frontend applications.

## Prerequisites

- [Node.js](https://nodejs.org/) (v14 or higher recommended)

## Installation

1. Clone or download this project.
2. Install the required dependencies:

```bash
npm install
```

## Configuration

Before starting the server, you need to provide your MyAnimeList API Client ID.

You can set it as an environment variable before running the server:

```bash
# On Linux/macOS
export MAL_CLIENT_ID="your_client_id_here"

# On Windows (Command Prompt)
set MAL_CLIENT_ID="your_client_id_here"

# On Windows (PowerShell)
$env:MAL_CLIENT_ID="your_client_id_here"
```

*(Note: If the `MAL_CLIENT_ID` is not provided, the server will log a warning and fall back to a default client ID, but it's highly recommended to use your own.)*

## Usage

Start the server using Node.js:

```bash
npm start
# or
node server.js
```

The server will start on port `3001` (or the port specified by the `PORT` environment variable).

You should see the following output in your terminal:
```
  ✅  AnimeTM Proxy running → http://localhost:3001
  📡  Forwarding MAL API requests with Client ID
```

## Available API Endpoints

The proxy exposes several endpoints to interact with the MAL API:

- `GET /api/spotlight` - Returns top airing anime.
- `GET /api/trending?page=1` - Returns popular/trending anime (paginated).
- `GET /api/recent?page=1` - Returns recently airing anime (paginated).
- `GET /api/search?q={query}&page=1` - Search for anime by name.
- `GET /api/browse?category={movie|tv|airing|bypopularity}&page=1` - Browse anime by category.
- `GET /api/anime/:id` - Get full details for a specific anime by its MAL ID.
- `GET /api/anime/:id/episodes` - Get a list of episodes for a specific anime.
- `GET /api/anime/:id/seasons` - Get related seasons/stories for a specific anime.
- `GET /api/health` - Health check endpoint.
