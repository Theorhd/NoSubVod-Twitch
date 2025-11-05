// Patch Amazon IVS worker to override fetch and serve sub-only VOD streams
console.log('[NSV Worker] Patch script loaded and executing...');

// Simple worker-compatible logger
const workerLogs: any[] = [];
function logWorker(message: string, data?: any) {
  const entry = {
    timestamp: Date.now(),
    message,
    data
  };
  workerLogs.push(entry);
  console.log('[NSV Worker]', message, data || '');
}

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
console.log('[NSV Worker] Overriding fetch function in worker context...');

(self as any).fetch = async function(input: RequestInfo, init?: RequestInit): Promise<Response> {
  const url = input instanceof Request ? input.url : input.toString();
  const method = init?.method || (input instanceof Request ? input.method : 'GET');
  
  // Log all intercepted requests in worker
  logWorker('Intercepted request', { url, method });
  
  const response = await oldFetch(input, init);

  // Patch playlist from unmuted to muted segments
  if (url.includes('cloudfront') && url.includes('.m3u8')) {
    logWorker('Patching unmuted to muted segments', { url });
    const body = await response.text();
    return new Response(body.replace(/-unmuted/g, '-muted'), { status: 200 });
  }

  if (url.startsWith('https://usher.ttvnw.net/vod/')) {
    logWorker('VOD request detected', { url, status: response.status });
    if (response.status !== 200) {
      logWorker('VOD access denied, generating fake playlist', { status: response.status });
      const vodId = url.split('https://usher.ttvnw.net/vod/')[1].split('.m3u8')[0];
      const data = await fetchTwitchDataGQL(vodId);
      if (!data || !data.data) {
        logWorker('Failed to fetch twitch data API', { error: 'No data returned' });
        return new Response('Unable to fetch twitch data API', { status: 403 });
      }
      const vodData = data.data.video;
      const channelData = vodData.owner;
      
      logWorker('VOD data fetched', { channel: channelData.login, type: vodData.broadcastType });

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
      const currentURL = new URL(vodData.seekPreviewsURL);
      const domain = currentURL.host;
      const paths = currentURL.pathname.split('/');
      const vodSpecialID = paths[paths.findIndex((el: string) => el.includes('storyboards')) - 1];
      
      logWorker('Using domain and vodSpecialID', { domain, vodSpecialID });
      
      let fakePlaylist = `#EXTM3U
#EXT-X-TWITCH-INFO:ORIGIN="s3",B="false",REGION="EU",USER-IP="127.0.0.1",SERVING-ID="${createServingID()}",CLUSTER="cloudfront_vod",USER-COUNTRY="BE",MANIFEST-CLUSTER="cloudfront_vod"`;

      const now = new Date();
      const created = new Date(vodData.createdAt);
      const daysDiff = (now.getTime() - created.getTime()) / 86400000;
      const broadcastType = vodData.broadcastType.toLowerCase();
      let startBandwidth = 8534030;
      let validQualitiesCount = 0;

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
        const valid = await isValidQuality(streamUrl);
        if (valid) {
          validQualitiesCount++;
          logWorker('Valid quality found', { quality: resKey, codec: valid.codec });
          const quality = resKey === 'chunked' ? `${resolutions[resKey].res.split('x')[1]}p` : resKey;
          const enabled = resKey === 'chunked' ? 'YES' : 'NO';
          fakePlaylist += `
#EXT-X-MEDIA:TYPE=VIDEO,GROUP-ID="${quality}",NAME="${quality}",AUTOSELECT=${enabled},DEFAULT=${enabled}
#EXT-X-STREAM-INF:BANDWIDTH=${startBandwidth},CODECS="${valid.codec},mp4a.40.2",RESOLUTION=${resolutions[resKey].res},VIDEO="${quality}",FRAME-RATE=${resolutions[resKey].fps}
${streamUrl}`;
          startBandwidth -= 100;
        } else {
          logWorker('Invalid quality', { quality: resKey });
        }
      }

      logWorker('Fake playlist generated', { qualitiesCount: validQualitiesCount });
      const headers = new Headers({ 'Content-Type': 'application/vnd.apple.mpegurl' });
      return new Response(fakePlaylist, { status: 200, headers });
    } else {
      logWorker('VOD access granted, using original response', { status: 200 });
    }
  }

  logWorker('Response', { url, status: response.status });
  return response;
};

console.log('[NSV Worker] Fetch override installed successfully in worker context');

// Expose worker logs to main thread via message
(self as any).getWorkerLogs = () => workerLogs;

export {};
