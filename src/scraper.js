const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const configPath = path.resolve(__dirname, '../config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

const sleep = ms => new Promise(r => setTimeout(r, ms));
const formatDate = () => new Date().toISOString();

const log = (msg, type='info') => {
  const ts = new Date().toISOString();
  const prefix = {info:'ℹ️',success:'✅',error:'❌',warning:'⚠️'}[type] || 'ℹ️';
  console.log(`[${ts}] ${prefix} ${msg}`);
};

const ensureDirectories = () => {
  ['../output/m3u','../output/json'].forEach(dir => {
    const abs = path.resolve(__dirname, dir);
    if (!fs.existsSync(abs)) { fs.mkdirSync(abs,{recursive:true}); log(`Created: ${abs}`); }
  });
};

// Parse M3U
const parseM3U = (content, region) => {
  const lines = content.split('\n'); const channels = []; let ch=null;
  lines.forEach(line => {
    line = line.trim();
    if (line.startsWith('#EXTINF:')) {
      const tvgId = (line.match(/tvg-id="([^"]*)"/)||[])[1]||uuidv4();
      const name = (line.match(/,(.+)$/)||[])[1]||'Unknown';
      ch = { id:tvgId, name, region, category:'Pluto TV', logo:'', streamUrl:null };
    } else if (line && ch && !line.startsWith('#')) { ch.streamUrl = line; channels.push(ch); ch=null; }
  });
  return channels;
};

// Pluto playlist custom mapping
const plutoUrls = {
  us: 'https://raw.githubusercontent.com/iptv-org/iptv/refs/heads/master/streams/us_pluto.m3u',
  it: 'https://raw.githubusercontent.com/iptv-org/iptv/refs/heads/master/streams/it_pluto.m3u',
  de: 'https://raw.githubusercontent.com/iptv-org/iptv/refs/heads/master/streams/de_pluto.m3u'
};

// Download and parse for each region
const fetchPlutoM3U = async (region) => {
  const url = plutoUrls[region.code];
  if (!url) { log(`No Pluto playlist for ${region.name}`, 'warning'); return []; }
  try {
    log(`🔗 Fetching: ${url}`);
    const res = await axios.get(url, {timeout:15000});
    if (res.data && res.data.includes('#EXTM3U')) {
      const channels = parseM3U(res.data, region.code);
      log(`🎯 ${channels.length} Pluto TV channels found for ${region.name}`);
      return channels;
    }
    log('Invalid file format','warning');
  } catch(e){
    log(`Error fetching ${url}: ${e.message}`,'error');
  }
  return [];
};

const generateM3U = (channels,region) => {
  let m3u = '#EXTM3U\n#EXTVLCOPT:network-caching=1000\n\n';
  channels.forEach(ch => {
    m3u += `#EXTINF:-1 tvg-id="${ch.id}" tvg-name="${ch.name}" group-title="Pluto TV",${ch.name}\n`;
    m3u += `${ch.streamUrl}\n\n`;
  });
  return m3u;
};

const saveM3U = (content, region) => {
  const filename = `pluto-${region.code}.m3u`;
  const out = path.resolve(__dirname, '../output/m3u', filename);
  fs.writeFileSync(out, content, 'utf8');
  log(`M3U saved: ${out}`);
};

const saveJSON = (channels,region) => {
  const filename = `pluto-${region.code}.json`;
  const out = path.resolve(__dirname, '../output/json', filename);
  fs.writeFileSync(out, JSON.stringify(channels,null,2),'utf8');
  log(`JSON saved: ${out}`);
};

const main = async () => {
  log('🚀 Pluto TV Regional Scraper START');
  ensureDirectories();
  const active = config.regions.filter(r => r.active);
  for(const region of active){
    const channels = await fetchPlutoM3U(region);
    if(channels.length>0){
      saveM3U(generateM3U(channels,region),region);
      saveJSON(channels,region);
    } else {
      log(`No channels found for ${region.name}`, 'warning');
    }
    await sleep(config.scraper?.delayBetweenRequests||500);
  }
  log('🎉 Done!');
};

main().catch(e => { log('Fatal: '+e.message,'error'); process.exit(1); });
