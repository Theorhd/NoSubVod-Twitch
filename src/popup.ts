declare const chrome: any;

// Util: current active tab URL
async function getActiveTabUrl(): Promise<string | null> {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs: any[]) => {
      resolve(tabs[0]?.url ?? null);
    });
  });
}

function extractVodId(url: string): string | null {
  try {
    const u = new URL(url);
    // Matches /videos/<id>
    const m = u.pathname.match(/\/videos\/(\d+)/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

async function fetchTwitchVideo(vodID: string): Promise<any> {
  const resp = await fetch('https://gql.twitch.tv/gql', {
    method: 'POST',
    body: JSON.stringify({
      query: `query { video(id: "${vodID}") { id title broadcastType createdAt lengthSeconds owner { login displayName } seekPreviewsURL } }`
    }),
    headers: {
      'Client-Id': 'kimne78kx3ncx6brgo4mv6wki5h1ko',
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    }
  });
  return resp.json();
}

function buildStreamUrl(domain: string, vodSpecialID: string, resKey: string, vodId: string, channelLogin: string, broadcastType: string, createdAt: string): string {
  const now = new Date();
  const created = new Date(createdAt);
  const daysDiff = (now.getTime() - created.getTime()) / 86400000;
  broadcastType = broadcastType.toLowerCase();

  if (broadcastType === 'highlight') {
    return `https://${domain}/${vodSpecialID}/${resKey}/highlight-${vodId}.m3u8`;
  }
  if (broadcastType === 'upload' && daysDiff > 7) {
    return `https://${domain}/${channelLogin}/${vodId}/${vodSpecialID}/${resKey}/index-dvr.m3u8`;
  }
  return `https://${domain}/${vodSpecialID}/${resKey}/index-dvr.m3u8`;
}

async function probeQuality(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'GET' });
    if (!res.ok) return false;
    const txt = await res.text();
    return txt.includes('.m3u8') || txt.includes('.ts') || txt.includes('.mp4');
  } catch {
    return false;
  }
}

function createOption(value: string, label: string): HTMLOptionElement {
  const opt = document.createElement('option');
  opt.value = value;
  opt.textContent = label;
  return opt;
}

async function init() {
  const status = document.getElementById('status')!;
  const content = document.getElementById('content')! as HTMLDivElement;
  const error = document.getElementById('error')!;
  const channelEl = document.getElementById('channel')!;
  const titleEl = document.getElementById('title')!;
  const typeEl = document.getElementById('type')!;
  const createdEl = document.getElementById('created')!;
  const vodEl = document.getElementById('vodId')!;
  const qualitySel = document.getElementById('quality')! as HTMLSelectElement;
  const btn = document.getElementById('downloadBtn')! as HTMLButtonElement;
  const customUrl = document.getElementById('customUrl')! as HTMLInputElement;
  const btnDirect = document.getElementById('downloadDirect')! as HTMLButtonElement;

  const tabUrl = await getActiveTabUrl();
  if (!tabUrl) {
    status.textContent = "Aucun onglet actif.";
    return;
  }

  const vodId = extractVodId(tabUrl);
  if (!vodId) {
    status.textContent = "Ouvrez une VOD Twitch (url /videos/<id>).";
    return;
  }
  vodEl.textContent = vodId;

  try {
    const gql = await fetchTwitchVideo(vodId);
    const video = gql?.data?.video;
    if (!video) throw new Error('Aucune info renvoyée.');

    channelEl.textContent = video.owner?.displayName ?? video.owner?.login ?? '—';
    titleEl.textContent = video.title ?? '—';
    typeEl.textContent = video.broadcastType ?? '—';
    createdEl.textContent = new Date(video.createdAt).toLocaleString();

    const seekUrl = new URL(video.seekPreviewsURL);
    const domain = seekUrl.host;
    const paths = seekUrl.pathname.split('/');
    const vodSpecialID = paths[paths.findIndex((el) => el.includes('storyboards')) - 1];

    const resolutions: Record<string, { res: string; fps: number; label: string }> = {
      '160p30': { res: '284x160', fps: 30, label: '160p' },
      '360p30': { res: '640x360', fps: 30, label: '360p' },
      '480p30': { res: '854x480', fps: 30, label: '480p' },
      '720p60': { res: '1280x720', fps: 60, label: '720p60' },
      '1080p60': { res: '1920x1080', fps: 60, label: '1080p60' },
      'chunked': { res: '1920x1080', fps: 60, label: 'Source' }
    };
    const keys = Object.keys(resolutions).reverse();

    qualitySel.innerHTML = '';
    qualitySel.appendChild(createOption('', 'Choisir une qualité…'));

    const candidates: { key: string; url: string }[] = [];
    for (const key of keys) {
      const url = buildStreamUrl(domain, vodSpecialID, key, vodId, video.owner.login, video.broadcastType, video.createdAt);
      if (await probeQuality(url)) {
        candidates.push({ key, url });
        qualitySel.appendChild(createOption(url, `${resolutions[key].label} (${resolutions[key].res})`));
      }
    }

    if (candidates.length === 0) {
      status.textContent = "Aucune qualité détectée (peut-être sub-only/privée).";
      return;
    }

    content.style.display = 'block';

    btn.disabled = true;
    qualitySel.addEventListener('change', () => {
      btn.disabled = !qualitySel.value;
    });

    btn.addEventListener('click', async () => {
      console.log('[NoSubVod] Download button clicked');
      error.textContent = '';
      status.textContent = '';
      status.style.display = 'block';
      const playlistUrl = qualitySel.value;
      if (!playlistUrl) {
        console.log('[NoSubVod] No playlist URL selected');
        return;
      }
      try {
        console.log('[NoSubVod] Starting download from:', playlistUrl);
        status.textContent = 'Récupération de la playlist...';
        btn.disabled = true;
        
        // Fetch playlist
        const resp = await fetch(playlistUrl);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const playlistText = await resp.text();
        console.log('[NoSubVod] Playlist fetched, parsing segments...');
        
        const lines = playlistText.split('\n');
        const segmentUrls: string[] = [];
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          const url = trimmed.startsWith('http') ? trimmed : new URL(trimmed, playlistUrl).toString();
          segmentUrls.push(url);
        }
        
        console.log(`[NoSubVod] Found ${segmentUrls.length} segments`);
        if (segmentUrls.length === 0) {
          throw new Error('Aucun segment trouvé dans la playlist');
        }
        
        // Download segments sequentially, skip failed ones
        const buffers: ArrayBuffer[] = [];
        let failedCount = 0;
        for (let i = 0; i < segmentUrls.length; i++) {
          status.textContent = `Téléchargement: ${i+1}/${segmentUrls.length}`;
          try {
            const segResp = await fetch(segmentUrls[i]);
            if (!segResp.ok) {
              console.warn(`[NoSubVod] Segment ${i+1} failed: HTTP ${segResp.status}, skipping...`);
              failedCount++;
              continue;
            }
            const buf = await segResp.arrayBuffer();
            buffers.push(buf);
          } catch (e) {
            console.warn(`[NoSubVod] Segment ${i+1} error:`, e, ', skipping...');
            failedCount++;
          }
        }
        
        console.log(`[NoSubVod] Downloaded ${buffers.length}/${segmentUrls.length} segments (${failedCount} failed)`);
        
        if (buffers.length === 0) {
          throw new Error('Aucun segment n\'a pu être téléchargé');
        }
        
        status.textContent = 'Préparation du fichier...';
        
        // Concatenate and download as .ts
        const blob = new Blob(buffers, { type: 'video/mp2t' });
        const blobUrl = URL.createObjectURL(blob);
        
        console.log('[NoSubVod] Initiating download...');
        chrome.downloads.download({ 
          url: blobUrl, 
          filename: `twitch_vod_${vodId}.ts`, 
          saveAs: true 
        }, (downloadId: number) => {
          console.log('[NoSubVod] Download started with ID:', downloadId);
          URL.revokeObjectURL(blobUrl);
          const msg = failedCount > 0 
            ? `Téléchargement lancé (${failedCount} segments omis)` 
            : 'Téléchargement lancé !';
          status.textContent = msg;
          setTimeout(() => { status.style.display = 'none'; }, 3000);
        });
      } catch (e: any) {
        console.error('[NoSubVod] Download error:', e);
        error.textContent = 'Échec: ' + (e.message || e);
        status.style.display = 'none';
      } finally {
        btn.disabled = false;
      }
    });

    // Replace custom URL download handler
    btnDirect.addEventListener('click', async () => {
      console.log('[NoSubVod] Direct download button clicked');
      const url = customUrl.value.trim();
      if (!url) {
        console.log('[NoSubVod] No URL provided');
        return;
      }
      error.textContent = '';
      status.textContent = '';
      status.style.display = 'block';
      
      // If playlist (.m3u8), download segments as .ts
      if (url.endsWith('.m3u8')) {
        try {
          console.log('[NoSubVod] Downloading m3u8 from:', url);
          status.textContent = 'Récupération de la playlist...';
          btnDirect.disabled = true;
          const resp = await fetch(url);
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
          const lines = (await resp.text()).split('\n');
          const segments: string[] = [];
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;
            segments.push(trimmed.startsWith('http') ? trimmed : new URL(trimmed, url).toString());
          }
          
          console.log(`[NoSubVod] Found ${segments.length} segments`);
          if (segments.length === 0) throw new Error('Aucun segment trouvé');
          
          const buffers: ArrayBuffer[] = [];
          let failedCount = 0;
          for (let i = 0; i < segments.length; i++) {
            status.textContent = `Téléchargement: ${i+1}/${segments.length}`;
            try {
              const r = await fetch(segments[i]);
              if (!r.ok) {
                console.warn(`[NoSubVod] Segment ${i+1} failed: HTTP ${r.status}, skipping...`);
                failedCount++;
                continue;
              }
              buffers.push(await r.arrayBuffer());
            } catch (e) {
              console.warn(`[NoSubVod] Segment ${i+1} error:`, e, ', skipping...');
              failedCount++;
            }
          }
          
          console.log(`[NoSubVod] Downloaded ${buffers.length}/${segments.length} segments (${failedCount} failed)`);
          
          if (buffers.length === 0) {
            throw new Error('Aucun segment n\'a pu être téléchargé');
          }
          
          status.textContent = 'Préparation du fichier...';
          const blob = new Blob(buffers, { type: 'video/mp2t' });
          const blobUrl = URL.createObjectURL(blob);
          chrome.downloads.download({ 
            url: blobUrl, 
            filename: `twitch_vod_custom.ts`, 
            saveAs: true 
          }, () => {
            console.log('[NoSubVod] Custom download started');
            URL.revokeObjectURL(blobUrl);
            const msg = failedCount > 0 
              ? `Téléchargement lancé (${failedCount} segments omis)` 
              : 'Téléchargement lancé !';
            status.textContent = msg;
            setTimeout(() => { status.style.display = 'none'; }, 3000);
          });
        } catch (e: any) {
          console.error('[NoSubVod] Direct download error:', e);
          error.textContent = 'Échec: ' + (e.message || e);
          status.style.display = 'none';
        } finally {
          btnDirect.disabled = false;
        }
      } else {
        // Direct file download
        console.log('[NoSubVod] Direct file download:', url);
        chrome.downloads.download({ url, saveAs: true }, () => {
          console.log('[NoSubVod] Direct download started');
          status.textContent = 'Téléchargement lancé !';
          setTimeout(() => { status.style.display = 'none'; }, 2000);
        });
      }
    });
  } catch (e: any) {
    status.textContent = '';
    (error as HTMLElement).textContent = 'Erreur: ' + (e?.message || e);
  }
}

init();
