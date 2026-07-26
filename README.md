<div align="center">
  <img src="https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExOHp1dzY1Znp4aXh1aWpqenEzazRyMmszbDRqMTh6ZXB2M2x3emYwZCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/LwsCiZPppEIJIIGmO1/giphy.gif" width="200" alt="Anime GIF" />
  <h1>AnimeTM</h1>
  <p><strong>A sleek MyAnimeList (MAL) API proxy server</strong></p>
  
  [![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
  [![Express.js](https://img.shields.io/badge/Express.js-000000?style=for-the-badge&logo=express&logoColor=white)](https://expressjs.com/)
  [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

  <p>
    AnimeTM acts as a backend service that fetches anime data from the MyAnimeList API. It adds caching, normalizes data for frontend use, limits request rates, and keeps your MAL Client ID securely hidden from the browser.
  </p>
</div>

<br>

<div align="center">
  <img src="https://media.giphy.com/media/26hirEPeos6yGJZJu/giphy.gif" width="400" alt="Coding Anime GIF" />
</div>

<br>

## ✨ Features
- 🔒 **Secure:** Keeps `MAL_CLIENT_ID` hidden from the frontend.
- ⚡ **Fast:** In-memory caching mechanism to optimize repeated API calls.
- 🛡️ **Rate Limited:** Built-in protection against API abuse (100 req/min).
- 🧹 **Normalized Data:** Cleans up messy MAL JSON into predictable, easy-to-use structures.
- 🌐 **CORS Ready:** Pre-configured for local dev and standard frontend hosts.

---

## 🛠️ Prerequisites

- [Node.js](https://nodejs.org/) (v14 or higher recommended)

---

## 🚀 Installation

1. **Clone or download** this repository.
2. **Install dependencies**:
```

npm install

```

---

## ⚙️ Configuration

Before running the server, provide your **MyAnimeList API Client ID** via environment variables.

```

# On Linux/macOS

export MAL_CLIENT_ID="your_client_id_here"

# On Windows (Command Prompt)

set MAL_CLIENT_ID="your_client_id_here"

# On Windows (PowerShell)

$env:MAL_CLIENT_ID="your_client_id_here"

```
*(Note: The server will fall back to a default client ID if not provided, but setting your own is highly recommended).*

---

## 💻 Usage

Start the server using Node.js:

```

npm start

# or for auto-reloading in dev:

npm run dev

```

The server will start on port `3001` (or your defined `PORT`). You should see:
```

✅  AnimeTM Proxy running → http://localhost:3001

📡  Forwarding MAL API requests with Client ID

```

<div align="center">
  <img src="https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExcG9zbjdtdnlsaGpvNmhucXBvMWJzdXZ5Z2lweWpyNmhweGQxdTNzdiZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/4ilFRqgbzbx4c/giphy.gif" width="300" alt="Success GIF" />
</div>

---

## 📡 API Endpoints

The proxy exposes several clean endpoints. It normalizes MAL data behind the scenes so your frontend gets predictable output.

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/spotlight` | Returns top airing anime for the current season. |
| `GET` | `/api/trending?page=1` | Returns popular/trending anime (paginated). |
| `GET` | `/api/recent?page=1` | Returns recently airing anime (paginated). |
| `GET` | `/api/search?q={query}&page=1` | Search for anime by name. |
| `GET` | `/api/browse?category={cat}&page=1` | Browse by category (`movie`, `tv`, `airing`, `bypopularity`). |
| `GET` | `/api/anime/:id` | Get full deep details for a specific anime by MAL ID. |
| `GET` | `/api/anime/:id/episodes` | Get a generated list of episodes. |
| `GET` | `/api/anime/:id/seasons` | Get related seasons, prequels, sequels, and stories. |
| `GET` | `/api/health` | Health check endpoint. |

---

<div align="center">
  <p>Built with ❤️ for Anime fans and Developers</p>
  <img src="https://media.giphy.com/media/11KzOet1ElBDz2/giphy.gif" width="150" alt="Wave GIF" />
</div>
```
