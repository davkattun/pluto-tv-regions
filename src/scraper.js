// Scarica da iptv-org con struttura CORRETTA
const fetchFromPlutoAPI = async (region) => {
  const maxRetries = config.scraper?.retries || 3;
  const timeout = config.scraper?.timeout || 15000;
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      // Struttura corretta: streams/CODICE_MINUSCOLO.m3u
      const url = `https://raw.githubusercontent.com/iptv-org/iptv/master/streams/${region.code.toLowerCase()}.m3u`;
      
      log(`Trying iptv-org for ${region.name}: ${url}`);
      
      const response = await axios.get(url, {
        headers: {
          'User-Agent': config.scraper?.userAgent || 'Mozilla/5.0',
          'Accept': 'text/plain,application/x-mpegURL'
        },
        timeout: timeout
      });

      if (response.data && response.data.includes('#EXTM3U')) {
        // Filtra SOLO canali Pluto TV
        const allChannels = parseM3U(response.data, region.code);
        const plutoChannels = allChannels.filter(ch => 
          ch.name.toLowerCase().includes('pluto') || 
          ch.streamUrl.includes('pluto.tv') ||
          ch.id.includes('Pluto')
        );
        
        if (plutoChannels.length > 0) {
          log(`Filtered ${plutoChannels.length} Pluto TV channels from ${allChannels.length} total channels`);
          return plutoChannels;
        } else {
          log(`No Pluto TV channels found in ${region.name}, returning all ${allChannels.length} channels`);
          return allChannels; // Fallback: ritorna tutti se nessun Pluto
        }
      }

      log(`Invalid M3U format for ${region.name}`, 'warning');
      return [];

    } catch (error) {
      attempt++;
      
      if (error.response && error.response.status === 404) {
        log(`Region ${region.name} (${region.code}) not available on iptv-org`, 'warning');
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
