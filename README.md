# 📺 Pluto TV Regions Tracker

[![Update Pluto TV](https://github.com/davkattun/pluto-tv-regions/actions/workflows/update-pluto.yml/badge.svg)](https://github.com/davkattun/pluto-tv-regions/actions/workflows/update-pluto.yml)
[![Docker](https://github.com/davkattun/pluto-tv-regions/actions/workflows/docker-build.yml/badge.svg)](https://github.com/davkattun/pluto-tv-regions/actions/workflows/docker-build.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> Auto-updating Pluto TV regional M3U playlists with Docker support

## 🌍 Available Regions

| Region | Channels | M3U Playlist | JSON Data |
|--------|----------|--------------|-----------|
| 🇺🇸 United States | [View](output/json/pluto-us.json) | [📺 M3U](output/m3u/pluto-us.m3u) | [📄 JSON](output/json/pluto-us.json) |
| 🇩🇪 Germany | [View](output/json/pluto-de.json) | [📺 M3U](output/m3u/pluto-de.m3u) | [📄 JSON](output/json/pluto-de.json) |
| 🇮🇹 Italy | [View](output/json/pluto-it.json) | [📺 M3U](output/m3u/pluto-it.m3u) | [📄 JSON](output/json/pluto-it.json) |

## 🚀 Quick Start

### Direct M3U Links (Raw GitHub)

US: https://raw.githubusercontent.com/davkattun/pluto-tv-regions/main/output/m3u/pluto-us.m3u
DE: https://raw.githubusercontent.com/davkattun/pluto-tv-regions/main/output/m3u/pluto-de.m3u
IT: https://raw.githubusercontent.com/davkattun/pluto-tv-regions/main/output/m3u/pluto-it.m3u


### Use with IPTV Players

1. **VLC Media Player**: Media → Open Network Stream → Paste URL
2. **Kodi**: Add-ons → PVR IPTV Simple Client → M3U Play List URL
3. **TiviMate** (Android TV): Add Playlist → URL → Paste link

## 🐳 Docker

### Quick Run

docker run --rm -v $(pwd)/output:/app/output ghcr.io/davkattun/pluto-tv-regions:latest


### Docker Compose

docker-compose up


## 🔧 Local Development

Install dependencies
npm install

Run scraper
npm start

Output files in:
- output/m3u/
- output/json/


## 📅 Auto-Update Schedule

Playlists are automatically updated **daily at 3:00 AM UTC** via GitHub Actions.

## 📊 Features

- ✅ Auto-updating M3U playlists
- ✅ JSON data export
- ✅ Docker support
- ✅ Multi-region support
- ✅ GitHub Actions automation
- ✅ No authentication required

## 🛠️ Tech Stack

- **Node.js 18** - Runtime
- **Axios** - HTTP client
- **Docker** - Containerization
- **GitHub Actions** - Automation

## 📝 License

MIT © [davkattun](https://github.com/davkattun)

## 🤝 Contributing

Pull requests welcome! For major changes, please open an issue first.

---

**Last update**: Auto-generated daily by GitHub Actions  
**Source**: [iptv-org/iptv](https://github.com/iptv-org/iptv)