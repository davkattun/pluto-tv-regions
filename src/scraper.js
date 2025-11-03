const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Carica configurazione
const config = JSON.parse(fs.readFileSync('./config.json', 'utf8'));

// Utility: Sleep function
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Utility: Formatta data
const formatDate = () => {
  return new Date().toISOString();
};

// Utility: Log con timestamp
const log = (message, type = 'info') => {
  const timestamp = new Date().toISOString();
  const prefix = {
    info: 'ℹ️',
    success: '✅',
    error: '❌',
    warning: '⚠️'
  }[type] || 'ℹ️';
  console.log(`[${timestamp}] ${prefix} ${message}`);
};

// Genera headers per API Pluto TV
const generateHeaders = (region) => {
  return {
    'User-Agent': config.scraper.userAgent,
    'Accept': 'application/json',
    'Accept-Language': 'en-US,en;q=0.9',
    'Origin': 'https://pluto.tv',
    'Referer': 'https://pluto.tv/',
  };
};

// Fetch canali da API Pluto TV per una regione
const fetchChannels = async (region) => {
  const maxRetries = config.scraper.retries;
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      log(`Fetching channels for ${region.name} (${region.code})...`);
      
      const url = `${region.apiUrl}?region=${region.code}`;
      const response = await axios.get(url, {
        headers: generateHeaders(region.code),
        timeout: config.scraper.timeout
      });

      if (response.data && Array.isArray(response.data)) {
        log(`Found ${response.data.length} channels for ${region.name}`, 'success');
        return response.data;
      }

      log(`No channels found for ${region.name}`, 'warning');
      return [];

    } catch (error) {
      attempt++;
      log(`Error fetching ${region.name} (attempt ${attempt}/${maxRetries}): ${error.message}`, 'error');
      
      if (attempt < maxRetries) {
        await sleep(2000 * attempt); // Backoff esponenziale
      }
    }
  }

  return [];
};

// Processa dati canale
const processChannel = (channel, regionCode) => {
  try {
    // Estrai URL stream
    const streamUrl = channel.stitched?.urls?.[0]?.url || 
                      channel.url || 
                      null;

    if (!streamUrl) return null;

    return {
      id: channel._id || channel.id || uuidv4(),
      name: channel.name || 'Unknown Channel',
      number: channel.number || 0,
      category: channel.category || 'General',
      logo: channel.images?.[0]?.url || 
            channel.logo?.path || 
            channel.thumbnail?.path || 
            '',
      streamUrl: streamUrl,
      region: regionCode,
      language: channel.language || 'en',
      summary: channel.summary || '',
      featured: channel.featured || false
    };
  } catch (error) {
    log(`Error processing channel: ${error.message}`, 'error');
    return null;
  }
};

// Genera file M3U
const generateM3U = (channels, region) => {
  let m3u = '#EXTM3U\n';
  m3u += `#EXTVLCOPT:network-caching=1000\n\n`;

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

// Salva file M3U
const saveM3U = (content, region) => {
  const filename = `pluto-${region.code}.m3u`;
  const filepath = path.join(config.output.directories.m3u, filename);
  
  fs.writeFileSync(filepath, content, 'utf8');
  log(`M3U saved: ${filepath}`, 'success');
};

// Salva file JSON
const saveJSON = (data, region) => {
  const filename = `pluto-${region.code}.json`;
  const filepath = path.join(config.output.directories.json, filename);
  
  const output = {
    region: {
      code: region.code,
      name: region.name,
      flag: region.flag
    },
    metadata: {
      generatedAt: formatDate(),
      totalChannels: data.length,
      version: config.project.version
    },
    channels: data
  };

  fs.writeFileSync(filepath, JSON.stringify(output, null, 2), 'utf8');
  log(`JSON saved: ${filepath}`, 'success');
};

// Genera statistiche
const generateStats = (allData) => {
  const stats = {
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

  return stats;
};

// Genera README per output/
const generateOutputReadme = (stats) => {
  let readme = `# Pluto TV Regional Links\n\n`;
  readme += `> Auto-generated on ${new Date().toUTCString()}\n\n`;
  readme += `## 📊 Statistics\n\n`;
  readme += `- **Total Regions**: ${stats.totalRegions}\n`;
  readme += `- **Total Channels**: ${stats.totalChannels}\n`;
  readme += `- **Last Update**: ${stats.generatedAt}\n\n`;
  readme += `## 🌍 Available Regions\n\n`;
  readme += `| Region | Channels | Categories | M3U | JSON |\n`;
  readme += `|--------|----------|------------|-----|------|\n`;

  stats.regions.forEach(region => {
    const m3uLink = `[📺 M3U](./m3u/pluto-${region.code}.m3u)`;
    const jsonLink = `[📄 JSON](./json/pluto-${region.code}.json)`;
    readme += `| ${region.flag} ${region.name} | ${region.channels} | ${region.categories} | ${m3uLink} | ${jsonLink} |\n`;
  });

  readme += `\n## 📖 How to Use\n\n`;
  readme += `### IPTV Players\n\n`;
  readme += `1. Copy the M3U link for your region\n`;
  readme += `2. Add to your IPTV player (VLC, Kodi, TiviMate, etc.)\n`;
  readme += `3. Enjoy!\n\n`;
  readme += `### JSON Data\n\n`;
  readme += `Use JSON files for custom applications or parsing.\n\n`;
  readme += `---\n\n`;
  readme += `*Generated by [pluto-tv-regions](https://github.com/davkattun/pluto-tv-regions)*\n`;

  fs.writeFileSync('./output/README.md', readme, 'utf8');
  log('Output README generated', 'success');
};

// Main function
const main = async () => {
  log('🚀 Starting Pluto TV Regions Scraper...');
  log(`Project: ${config.project.name} v${config.project.version}`);

  const activeRegions = config.regions.filter(r => r.active);
  log(`Active regions: ${activeRegions.length}`);

  const allData = [];

  for (const region of activeRegions) {
    try {
      // Fetch canali
      const rawChannels = await fetchChannels(region);
      
      // Processa canali
      const processedChannels = rawChannels
        .map(ch => processChannel(ch, region.code))
        .filter(ch => ch !== null);

      if (processedChannels.length === 0) {
        log(`No valid channels for ${region.name}`, 'warning');
        continue;
      }

      // Salva M3U
      if (config.output.formats.includes('m3u')) {
        const m3uContent = generateM3U(processedChannels, region);
        saveM3U(m3uContent, region);
      }

      // Salva JSON
      if (config.output.formats.includes('json')) {
        saveJSON(processedChannels, region);
      }

      allData.push({
        region: {
          code: region.code,
          name: region.name,
          flag: region.flag
        },
        channels: processedChannels
      });

      // Delay tra richieste
      await sleep(config.scraper.delayBetweenRequests);

    } catch (error) {
      log(`Fatal error processing ${region.name}: ${error.message}`, 'error');
    }
  }

  // Genera statistiche e README
  if (config.features.generateStats && config.features.createReadme) {
    const stats = generateStats(allData);
    generateOutputReadme(stats);
  }

  log('✅ Scraper completed successfully!', 'success');
  log(`Total channels collected: ${allData.reduce((sum, r) => sum + r.channels.length, 0)}`);
};

// Esegui
main().catch(error => {
  log(`Fatal error: ${error.message}`, 'error');
  process.exit(1);
});
