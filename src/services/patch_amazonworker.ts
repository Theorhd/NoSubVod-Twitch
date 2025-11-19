// Patch Amazon IVS worker to override fetch and serve sub-only VOD streams
async function fetchTwitchDataGQL(vodID: string): Promise<any> {
  const resp = await fetch("https://gql.twitch.tv/gql", {
    method: 'POST',
    body: JSON.stringify({
      query: `query { video(id: "${vodID}") { broadcastType, createdAt, seekPreviewsURL, owner { login } }}`
    }),
    headers: {
      'Client-Id': 'kimne78kx3ncx6brgo4mv6wki5h1ko',
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    }
  });
  return resp.json();
}

function createServingID(): string {
  const w = '0123456789abcdefghijklmnopqrstuvwxyz'.split('');
  let id = '';
  for (let i = 0; i < 32; i++) id += w[Math.floor(Math.random() * w.length)];
  return id;
}

async function isValidQuality(url: string): Promise<{ codec: string } | null> {
  const response = await fetch(url);
  if (response.ok) {
    const data = await response.text();
    if (data.includes('.ts')) {
      return { codec: 'avc1.4D001E' };
    }
    if (data.includes('.mp4')) {
      const mp4Req = await fetch(url.replace('index-dvr.m3u8', 'init-0.mp4'));
      if (mp4Req.ok) {
        const content = await mp4Req.text();
        return { codec: content.includes('hev1') ? 'hev1.1.6.L93.B0' : 'avc1.4D001E' };
      }
      return { codec: 'hev1.1.6.L93.B0' };
    }
  }
  return null;
}

const oldFetch = (self as any).fetch;

(self as any).fetch = async function(input: RequestInfo, init?: RequestInit): Promise<Response> {
  const url = input instanceof Request ? input.url : input.toString();
  
  // Log toutes les requêtes pour debug
  if (url.includes('usher.ttvnw.net') || url.includes('.m3u8')) {
    console.log('[NSV] Intercepting fetch:', url);
  }
  
  // Optimisation : Utiliser Promise.race avec timeout pour éviter les blocages
  const fetchWithTimeout = (promise: Promise<Response>, timeoutMs: number = 30000) => {
    return Promise.race([
      promise,
      new Promise<Response>((_, reject) => 
        setTimeout(() => reject(new Error('Fetch timeout')), timeoutMs)
      )
    ]);
  };
  
  let response: Response;
  try {
    response = await fetchWithTimeout(oldFetch(input, init));
  } catch (error) {
    console.error('[NSV] Fetch error:', error);
    return new Response('Fetch failed', { status: 500 });
  }

  // Patch playlist from unmuted to muted segments
  if (url.includes('cloudfront') && url.includes('.m3u8')) {
    const body = await response.text();
    return new Response(body.replace(/-unmuted/g, '-muted'), { status: 200 });
  }

  if (url.startsWith('https://usher.ttvnw.net/vod/')) {
    if (response.status !== 200) {
      // Extract vodId, removing any version prefix (v2/, v3/, etc.)
      let vodId = url.split('https://usher.ttvnw.net/vod/')[1].split('.m3u8')[0];
      vodId = vodId.replace(/^v\d+\//, ''); // Remove v2/, v3/, etc.
      
      console.log('[NSV] Fetching VOD data for:', vodId);
      const data = await fetchTwitchDataGQL(vodId);
      console.log('[NSV] GQL response:', JSON.stringify(data));
      
      if (!data || !data.data) {
        console.error('[NSV] Invalid GQL response structure:', data);
        return new Response('Unable to fetch twitch data API', { status: 403 });
      }
      
      const vodData = data.data.video;
      if (!vodData) {
        console.error('[NSV] No video data in response:', data.data);
        return new Response('Video not found', { status: 404 });
      }
      
      if (!vodData.owner || !vodData.seekPreviewsURL) {
        console.error('[NSV] Missing vodData.owner or seekPreviewsURL:', vodData);
        return new Response('Invalid VOD data', { status: 403 });
      }
      const channelData = vodData.owner;

      const resolutions: Record<string, { res: string; fps: number }> = {
        '160p30': { res: '284x160', fps: 30 },
        '360p30': { res: '640x360', fps: 30 },
        '480p30': { res: '854x480', fps: 30 },
        '720p60': { res: '1280x720', fps: 60 },
        '1080p60': { res: '1920x1080', fps: 60 },
        chunked: { res: '1920x1080', fps: 60 }
      };
      const keys = Object.keys(resolutions).reverse();
      
      // Extract domain and vodSpecialID from seekPreviewsURL
      let domain: string;
      let vodSpecialID: string;
      
      try {
        const currentURL = new URL(vodData.seekPreviewsURL);
        domain = currentURL.host;
        const paths = currentURL.pathname.split('/');
        const storyboardIndex = paths.findIndex((el: string) => el.includes('storyboards'));
        if (storyboardIndex === -1) {
          console.error('[NSV] Cannot find storyboards in URL:', vodData.seekPreviewsURL);
          return new Response('Invalid seekPreviewsURL format', { status: 403 });
        }
        vodSpecialID = paths[storyboardIndex - 1];
        if (!vodSpecialID) {
          console.error('[NSV] Cannot extract vodSpecialID from:', vodData.seekPreviewsURL);
          return new Response('Invalid vodSpecialID', { status: 403 });
        }
      } catch (error) {
        console.error('[NSV] Failed to parse seekPreviewsURL:', vodData.seekPreviewsURL, error);
        return new Response('Failed to parse seekPreviewsURL', { status: 403 });
      }
      
      let fakePlaylist = `#EXTM3U
#EXT-X-TWITCH-INFO:ORIGIN="s3",B="false",REGION="EU",USER-IP="127.0.0.1",SERVING-ID="${createServingID()}",CLUSTER="cloudfront_vod",USER-COUNTRY="BE",MANIFEST-CLUSTER="cloudfront_vod"`;

      const now = new Date();
      const created = new Date(vodData.createdAt);
      const daysDiff = (now.getTime() - created.getTime()) / 86400000;
      const broadcastType = vodData.broadcastType.toLowerCase();
      let startBandwidth = 8534030;

      for (const resKey of keys) {
        let streamUrl: string | undefined;
        if (broadcastType === 'highlight') {
          streamUrl = `https://${domain}/${vodSpecialID}/${resKey}/highlight-${vodId}.m3u8`;
        } else if (broadcastType === 'upload' && daysDiff > 7) {
          streamUrl = `https://${domain}/${channelData.login}/${vodId}/${vodSpecialID}/${resKey}/index-dvr.m3u8`;
        } else {
          streamUrl = `https://${domain}/${vodSpecialID}/${resKey}/index-dvr.m3u8`;
        }
        if (!streamUrl) continue;
        
        // Optimisation : Valider les qualités en parallèle avec timeout
        try {
          const valid = await Promise.race([
            isValidQuality(streamUrl),
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)) // Timeout 5s par qualité
          ]);
          
          if (valid) {
            const quality = resKey === 'chunked' ? `${resolutions[resKey].res.split('x')[1]}p` : resKey;
            const enabled = resKey === 'chunked' ? 'YES' : 'NO';
            fakePlaylist += `
#EXT-X-MEDIA:TYPE=VIDEO,GROUP-ID="${quality}",NAME="${quality}",AUTOSELECT=${enabled},DEFAULT=${enabled}
#EXT-X-STREAM-INF:BANDWIDTH=${startBandwidth},CODECS="${valid.codec},mp4a.40.2",RESOLUTION=${resolutions[resKey].res},VIDEO="${quality}",FRAME-RATE=${resolutions[resKey].fps}
${streamUrl}`;
            startBandwidth -= 100;
          }
        } catch (error) {
          console.warn('[NSV] Failed to validate quality for', resKey, error);
          // Continuer avec les autres qualités
        }
      }

      const headers = new Headers({ 'Content-Type': 'application/vnd.apple.mpegurl' });
      return new Response(fakePlaylist, { status: 200, headers });
    }
  }

  return response;
};

export {};
