const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const configPath = path.resolve(__dirname, '../config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const formatDate = () => new Date().toISOString();

const log = (message, type = 'info') => {
  const timestamp = new Date().toISOString();
  const prefix = { info: 'ℹ️', success: '✅', error: '❌', warning: '⚠️' }[type] || 'ℹ️';
  console.log(`[${timestamp}] ${prefix} ${message}`);
};

const ensureDirectories = () => {
  const dirs = [
    path.resolve(__dirname, '../output/m3u'),
    path.resolve(__dirname, '../output/json')
  ];
  dirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      log(`Created directory: ${dir}`);
    }
  });
};

const parseM3U = (m3uContent, regionCode) => {
  const channels = [];
  const lines = m3uContent.split('\n');
  let currentChannel = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line.startsWith('#EXTINF:')) {
      const tvgId = (line.match(/tvg-id="([^"]*)"/) || [])[1] || uuidv4();
      const tvgName = (line.match(/tvg-name="([^"]*)"/) || [])[1] || '';
      const tvgLogo = (line.match(/tvg-logo="([^"]*)"/) || [])[1] || '';
      const groupTitle = (line.match(/group-title="([^"]*)"/) || [])[1] || 'Pluto';
      const name = (line.match(/,(.+)$/) || [])[1] || tvgName || 'Unknown';

      currentChannel = {
        id: tvgId,
        name: name,
        number: 0,
        category: groupTitle,
        logo: tvgLogo,
        streamUrl: null,
        region: regionCode,
        language: 'en',
        summary: '',
        featured: false
      };
    } else if (line && !line.startsWith('#') && currentChannel) {
      currentChannel.streamUrl = line;
      channels.push(currentChannel);
      currentChannel = null;
    }
  }

  return channels;
};

// USA i.mjh.nz - servizio affidabile e aggiornato
const fetchFromPlutoAPI = async (region) => {
  const maxRetries = config.scraper?.retries || 3;
  const timeout = config.scraper?.timeout || 15000;
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      // i.mjh.nz usa codici maiuscoli (US, IT, UK, etc)
      const url = `https://i.mjh.nz/PlutoTV/${region.code.toUpperCase()}.m3u`;
      
      log(`Trying i.mjh.nz for ${region.name}: ${url}`);
      
      const response = await axios.get(url, {
        headers: {
          'User-Agent': config.scraper?.userAgent || 'Mozilla/5.0',
          'Accept': 'text/plain,application/x-mpegURL'
        },
        timeout: timeout
      });

      if (response.data && response.data.includes('#EXTM3U')) {
        const channels = parseM3U(response.data, region.code);
        return channels;
      }

      log(`Invalid M3U format for ${region.name}`, 'warning');
      return [];

    } catch (error) {
      attempt++;
      
      if (error.response && error.response.status === 404) {
        log(`Region ${region.name} (${region.code.toUpperCase()}) not available on i.mjh.nz`, 'warning');
        return [];
      }
      
      const statusMsg = error.response ? `(HTTP ${error.response.status})` : '';
      log(`Fetch failed for ${region.name} ${statusMsg} - attempt ${attempt}/${maxRetries}: ${error.message}`, 'error');
      
      if (attempt < maxRetries) {
        await sleep(2000 * attempt);
      }
    }
  }
  
  return [];
};

const generateM3U = (channels, region) => {
  let m3u = '#EXTM3U\n';
  m3u += '#EXTVLCOPT:network-caching=1000\n\n';

  channels.forEach(channel => {
    if (!channel || !channel.streamUrl) return;
    const tvgId = channel.id;
    const tvgName = channel.name.replace(/"/g, "'");
    const tvgLogo = channel.logo;
    const groupTitle = channel.category;
    m3u += `#EXTINF:-1 tvg-id="${tvgId}" tvg-name="${tvgName}" tvg-logo="${tvgLogo}" group-title="${groupTitle}",${channel.name}\n`;
    m3u += `${channel.streamUrl}\n\n`;
  });

  return m3u;
};

const saveM3U = (content, region) => {
  try {
    const filename = `pluto-${region.code}.m3u`;
    const outputDir = path.resolve(__dirname, '../output/m3u');
    const filepath = path.join(outputDir, filename);
    fs.writeFileSync(filepath, content, 'utf8');
    log(`M3U saved: ${filepath}`, 'success');
  } catch (error) {
    log(`Failed to save M3U for ${region.name}: ${error.message}`, 'error');
  }
};

const saveJSON = (data, region) => {
  try {
    const filename = `pluto-${region.code}.json`;
    const outputDir = path.resolve(__dirname, '../output/json');
    const filepath = path.join(outputDir, filename);
    
    const output = {
      region: { code: region.code, name: region.name, flag: region.flag },
      metadata: {
        generatedAt: formatDate(),
        totalChannels: data.length,
        version: config.project?.version || '1.0.0',
        source: 'i.mjh.nz'
      },
      channels: data
    };

    fs.writeFileSync(filepath, JSON.stringify(output, null, 2), 'utf8');
    log(`JSON saved: ${filepath}`, 'success');
  } catch (error) {
    log(`Failed to save JSON for ${region.name}: ${error.message}`, 'error');
  }
};

const generateStats = (allData) => {
  return {
    generatedAt: formatDate(),
    totalRegions: allData.length,
    totalChannels: allData.reduce((sum, r) => sum + r.channels.length, 0),
    regions: allData.map(r => ({
      code: r.region.code,
      name: r.region.name,
      flag: r.region.flag,
      channels: r.channels.length,
      categories: [...new Set(r.channels.map(c => c.category))].length
    }))
  };
};

const generateOutputReadme = (stats) => {
  try {
    let readme = '# Pluto TV Regional Links\n\n';
    readme += `> Auto-generated on ${new Date().toUTCString()}\n\n`;
    readme += '**Source**: [i.mjh.nz](https://i.mjh.nz/PlutoTV/) - Community-maintained Pluto TV M3U service\n\n';
    readme += '## 📊 Statistics\n\n';
    readme += `- **Total Regions**: ${stats.totalRegions}\n`;
    readme += `- **Total Channels**: ${stats.totalChannels}\n`;
    readme += `- **Last Update**: ${stats.generatedAt}\n\n`;
    readme += '## 🌍 Available Regions\n\n';
    readme += '| Region | Channels | Categories | M3U | JSON |\n';
    readme += '|--------|----------|------------|-----|------|\n';

    stats.regions.forEach(region => {
      const m3uLink = `[📺 M3U](./m3u/pluto-${region.code}.m3u)`;
      const jsonLink = `[📄 JSON](./json/pluto-${region.code}.json)`;
      readme += `| ${region.flag} ${region.name} | ${region.channels} | ${region.categories} | ${m3uLink} |
