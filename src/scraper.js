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
      const groupTitle = (line.match(/group-title="([^"]*)"/) || [])[1] || 'General';
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

const fetchFromIPTVOrg = async (region) => {
  const maxRetries = config.scraper?.retries || 3;
  const timeout = config.scraper?.timeout || 15000;
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      const url = `https://raw.githubusercontent.com/iptv-org/iptv/master/streams/${region.code.toLowerCase()}.m3u`;
      
      log(`🔗 Fetching: ${url}`);
      
      const response = await axios.get(url, {
        headers: {
          'User-Agent': config.scraper?.userAgent || 'Mozilla/5.0',
          'Accept': 'text/plain'
        },
        timeout: timeout
      });

      log(`📥 Response: ${response.status} - ${response.data.length} bytes`);

      if (response.data && response.data.includes('#EXTM3U')) {
        const allChannels = parseM3U(response.data, region.code);
        log(`📺 Parsed ${allChannels.length} total channels`);
        
        const plutoChannels = allChannels.filter(ch => 
          ch.name.toLowerCase().includes('pluto') || 
          ch.streamUrl.includes('pluto.tv') ||
          ch.id.toLowerCase().includes('pluto')
        );
        
        log(`🎯 Found ${plutoChannels.length} Pluto TV channels`);
        
        if (plutoChannels.length > 0) {
          return plutoChannels;
        } else {
          log(`⚠️ No Pluto channels, using all ${allChannels.length} channels`);
          return allChannels;
        }
      }

      log(`Invalid M3U format`, 'warning');
      return [];

    } catch (error) {
      attempt++;
      
      if (error.response && error.response.status === 404) {
        log(`❌ 404 - Region ${region.name} (${region.code}) not found on iptv-org`, 'error');
        return [];
      }
      
      log(`Error attempt ${attempt}/${maxRetries}: ${error.message}`, 'error');
      
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
    log(`Failed to save M3U: ${error.message}`, 'error');
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
        source: 'iptv-org/iptv'
      },
      channels: data
    };

    fs.writeFileSync(filepath, JSON.stringify(output, null, 2), 'utf8');
    log(`JSON saved: ${filepath}`, 'success');
  } catch (error) {
    log(`Failed to save JSON: ${error.message}`, 'error');
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
    readme += '**Source**: [iptv-org/iptv](https://github.com/iptv-org/iptv)\n\n';
    readme += '## 📊 Statistics\n\n';
    readme += `- **Regions**: ${stats.totalRegions}\n`;
    readme += `- **Channels**: ${stats.totalChannels}\n`;
    readme += `- **Updated**: ${stats.generatedAt}\n\n`;
    readme += '## 🌍 Regions\n\n';
    readme += '| Region | Channels | M3U | JSON |\n';
    readme += '|--------|----------|-----|------|\n';

    stats.regions.forEach(region => {
      const m3u = `[M3U](./m3u/pluto-${region.code}.m3u)`;
      const json = `[JSON](./json/pluto-${region.code}.json)`;
      readme += `| ${region.flag} ${region.name} | ${region.channels} | ${m3u} | ${json} |\n`;
    });

    readme += '\n---\n*Generated by [pluto-tv-regions](https://github.com/davkattun/pluto-tv-regions)*\n';

    fs.writeFileSync(path.resolve(__dirname, '../output/README.md'), readme, 'utf8');
    log('README generated', 'success');
  } catch (error) {
    log(`README error: ${error.message}`, 'error');
  }
};

const main = async () => {
  log('🚀 Starting Pluto TV Scraper');
  log('Source: iptv-org/iptv');

  ensureDirectories();

  const activeRegions = config.regions?.filter(r => r.active) || [];
  if (activeRegions.length === 0) {
    log('No active regions', 'error');
    process.exit(1);
  }

  log(`Processing ${activeRegions.length} regions`);

  const allData = [];
  let successCount = 0;

  for (const region of activeRegions) {
    try {
      log(`\n▶️  ${region.name} (${region.code})`);
      const channels = await fetchFromIPTVOrg(region);

      if (channels.length === 0) {
        log(`No channels for ${region.name}`, 'warning');
        continue;
      }

      log(`✅ ${channels.length} channels ready`);

      if (config.output?.formats?.includes('m3u')) {
        saveM3U(generateM3U(channels, region), region);
      }

      if (config.output?.formats?.includes('json')) {
        saveJSON(channels, region);
      }

      allData.push({
        region: { code: region.code, name: region.name, flag: region.flag },
        channels: channels
      });

      successCount++;
      await sleep(config.scraper?.delayBetweenRequests || 500);

    } catch (error) {
      log(`Error: ${error.message}`, 'error');
    }
  }

  if (allData.length > 0) {
    if (config.features?.generateStats && config.features?.createReadme) {
      generateOutputReadme(generateStats(allData));
    }

    const total = allData.reduce((sum, r) => sum + r.channels.length, 0);
    log(`\n🎉 Complete! ${successCount}/${activeRegions.length} regions, ${total} channels`, 'success');
  } else {
    log('No data collected', 'error');
    process.exit(1);
  }
};

main().catch(error => {
  log(`Fatal: ${error.message}`, 'error');
  process.exit(1);
});
