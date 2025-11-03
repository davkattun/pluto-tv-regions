cat > src/scraper.js << 'EOF'
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Carica configurazione con path assoluto
const configPath = path.resolve(__dirname, '../config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

// Utility: Sleep function
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Utility: Formatta data ISO
const formatDate = () => new Date().toISOString();

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

// Assicura che le directory di output esistano
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

// Parse M3U file
const parseM3U = (m3uContent, regionCode) => {
  const channels = [];
  const lines = m3uContent.split('\n');
  let currentChannel = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line.startsWith('#EXTINF:')) {
      // Estrai metadata
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
      // URL stream
      currentChannel.streamUrl = line;
      channels.push(currentChannel);
      currentChannel = null;
    }
  }

  return channels;
};

// Scarica M3U da iptv-org repository
const fetchFromPlutoAPI = async (region) => {
  const maxRetries = config.scraper?.retries || 3;
  const timeout = config.scraper?.timeout || 15000;
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      const url = `https://raw.githubusercontent.com/iptv-org/iptv/master/streams/pluto_${region.code}.m3u`;
      
      const response = await axios.get(url, {
        headers: {
          'User-Agent': config.scraper?.userAgent || 'Mozilla/5.0',
          'Accept': 'text/plain'
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
        log(`No Pluto M3U found for ${region.name} on iptv-org`, 'warning');
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

// Genera file M3U
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

// Salva file M3U
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

// Salva file JSON
const saveJSON = (data, region) => {
  try {
    const filename = `pluto-${region.code}.json`;
    const outputDir = path.resolve(__dirname, '../output/json');
    const filepath = path.join(outputDir, filename);
    
    const output = {
      region: {
        code: region.code,
        name: region.name,
        flag: region.flag
      },
      metadata: {
        generatedAt: formatDate(),
        totalChannels: data.length,
        version: config.project?.version || '1.0.0',
        source: 'iptv-org/iptv'
      },
      channels: data
    };

    fs.writeFileSync(filepath, JSON.stringify(output, null, 2), 'utf8');
    log(`JSON saved: ${filepath}`, 'success');
  } catch (error) {
    log(`Failed to save JSON for ${region.name}: ${error.message}`, 'error');
  }
};

// Genera statistiche
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

// Genera README per output/
const generateOutputReadme = (stats) => {
  try {
    let readme = '# Pluto TV Regional Links\n\n';
    readme += `> Auto-generated on ${new Date().toUTCString()}\n\n`;
    readme += '**Source**: [iptv-org/iptv](https://github.com/iptv-org/iptv) community-maintained lists\n\n';
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
      readme += `| ${region.flag} ${region.name} | ${region.channels} | ${region.categories} | ${m3uLink} | ${jsonLink} |\n`;
    });

    readme += '\n## 📖 How to Use\n\n';
    readme += '### IPTV Players\n\n';
    readme += '1. Copy the raw M3U link for your region\n';
    readme += '2. Add to your IPTV player (VLC, Kodi, TiviMate, Perfect Player, etc.)\n';
    readme += '3. Enjoy free streaming!\n\n';
    readme += '### Direct Links (Raw GitHub)\n\n';
    
    stats.regions.forEach(region => {
      readme += `- **${region.flag} ${region.name}**: \`https://raw.githubusercontent.com/davkattun/pluto-tv-regions/main/output/m3u/pluto-${region.code}.m3u\`\n`;
    });

    readme += '\n### JSON Data\n\n';
    readme += 'Use JSON files for custom applications, dashboards, or data parsing.\n\n';
    readme += '## 📡 Supported Players\n\n';
    readme += '- **VLC Media Player** (Windows, Mac, Linux)\n';
    readme += '- **Kodi** (with IPTV Simple Client)\n';
    readme += '- **TiviMate** (Android TV)\n';
    readme += '- **Perfect Player** (Android)\n';
    readme += '- **GSE Smart IPTV** (iOS, tvOS)\n';
    readme += '- Any M3U-compatible IPTV player\n\n';
    readme += '---\n\n';
    readme += `*Generated by [pluto-tv-regions](https://github.com/davkattun/pluto-tv-regions) • Data from [iptv-org](https://github.com/iptv-org/iptv)*\n`;

    const readmePath = path.resolve(__dirname, '../output/README.md');
    fs.writeFileSync(readmePath, readme, 'utf8');
    log('Output README generated', 'success');
  } catch (error) {
    log(`Failed to generate README: ${error.message}`, 'error');
  }
};

// Main function
const main = async () => {
  log('🚀 Starting Pluto TV Regions Scraper...');
  log(`Project: ${config.project?.name || 'Pluto TV Regions'} v${config.project?.version || '1.0.0'}`);
  log('Source: iptv-org/iptv community lists');

  // Assicura esistenza directory
  ensureDirectories();

  const activeRegions = config.regions?.filter(r => r.active) || [];
  if (activeRegions.length === 0) {
    log('No active regions found in config', 'error');
    process.exit(1);
  }

  log(`Active regions to process: ${activeRegions.length}`);

  const allData = [];
  let successCount = 0;
  let failCount = 0;

  for (const region of activeRegions) {
    try {
      log(`Fetching channels for ${region.name} (${region.code})...`);
      const processedChannels = await fetchFromPlutoAPI(region);

      if (processedChannels.length === 0) {
        log(`No channels available for ${region.name}`, 'warning');
        failCount++;
        continue;
      }

      log(`Found ${processedChannels.length} channels for ${region.name}`, 'success');

      // Salva M3U
      if (config.output?.formats?.includes('m3u')) {
        const m3uContent = generateM3U(processedChannels, region);
        saveM3U(m3uContent, region);
      }

      // Salva JSON
      if (config.output?.formats?.includes('json')) {
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

      successCount++;

      // Delay tra richieste
      const delay = config.scraper?.delayBetweenRequests || 500;
      await sleep(delay);

    } catch (error) {
      log(`Fatal error processing ${region.name}: ${error.message}`, 'error');
      failCount++;
    }
  }

  // Genera statistiche e README solo se abbiamo dati
  if (allData.length > 0) {
    if (config.features?.generateStats && config.features?.createReadme) {
      const stats = generateStats(allData);
      generateOutputReadme(stats);
    }

    const totalChannels = allData.reduce((sum, r) => sum + r.channels.length, 0);
    log('✅ Scraper completed successfully!', 'success');
    log(`Successful regions: ${successCount}/${activeRegions.length}`);
    log(`Total channels collected: ${totalChannels}`);
  } else {
    log('❌ No data collected from any region', 'error');
    process.exit(1);
  }

  if (failCount > 0) {
    log(`⚠️  ${failCount} region(s) had no available data`, 'warning');
  }
};

// Esegui con error handling
main().catch(error => {
  log(`Fatal error: ${error.message}`, 'error');
  console.error(error.stack);
  process.exit(1);
});
EOF
