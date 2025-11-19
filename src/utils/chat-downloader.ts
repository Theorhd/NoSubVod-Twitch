/**
 * Chat Downloader Utility
 * Downloads Twitch chat replay for a VOD using Twitch API
 */

export interface ChatMessage {
  timestamp: number; // Offset en secondes depuis le début de la VOD
  username: string;
  userColor: string;
  message: string;
  badges: string[];
  emotes: Array<{ name: string; id: string }>;
}

export interface ChatDownloadProgress {
  current: number;
  total: number;
  percent: number;
}

export class ChatDownloader {
  private static readonly CLIENT_ID = 'kimne78kx3ncx6brgo4mv6wki5h1ko';
  private static readonly GQL_ENDPOINT = 'https://gql.twitch.tv/gql';
  
  /**
   * Télécharge tous les messages du chat pour une VOD
   */
  static async downloadChat(
    vodId: string,
    onProgress?: (progress: ChatDownloadProgress) => void
  ): Promise<ChatMessage[]> {
    console.log(`[ChatDownloader] Starting chat download for VOD ${vodId}`);
    
    const messages: ChatMessage[] = [];
    let cursor: string | null = null;
    let hasMore = true;
    let iteration = 0;
    
    try {
      while (hasMore) {
        iteration++;
        
        const response = await this.fetchChatBatch(vodId, cursor);
        
        if (!response?.data?.video?.comments?.edges) {
          console.warn('[ChatDownloader] No comments data in response');
          break;
        }
        
        const edges = response.data.video.comments.edges;
        
        if (edges.length === 0) {
          hasMore = false;
          break;
        }
        
        // Traiter les messages
        for (const edge of edges) {
          const comment = edge.node;
          
          if (!comment) continue;
          
          const message: ChatMessage = {
            timestamp: comment.contentOffsetSeconds || 0,
            username: comment.commenter?.displayName || comment.commenter?.login || 'Unknown',
            userColor: comment.message?.userColor || '#FFFFFF',
            message: this.extractMessageText(comment.message),
            badges: this.extractBadges(comment.message?.userBadges || []),
            emotes: this.extractEmotes(comment.message?.fragments || [])
          };
          
          messages.push(message);
        }
        
        // Vérifier s'il y a plus de messages
        const pageInfo = response.data.video.comments.pageInfo;
        hasMore = pageInfo?.hasNextPage || false;
        cursor = edges[edges.length - 1]?.cursor || null;
        
        // Mise à jour de la progression
        if (onProgress) {
          // Estimation du total basée sur la durée de la VOD
          // En moyenne ~100-500 messages par minute selon la popularité
          const estimatedTotal = Math.max(messages.length, iteration * edges.length);
          onProgress({
            current: messages.length,
            total: estimatedTotal,
            percent: Math.min(95, (iteration * 5)) // Progression estimée
          });
        }
        
        console.log(`[ChatDownloader] Batch ${iteration}: Retrieved ${edges.length} messages (Total: ${messages.length})`);
        
        // Petit délai pour éviter le rate limiting
        if (hasMore) {
          await this.delay(100);
        }
      }
      
      console.log(`[ChatDownloader] ✓ Chat download complete: ${messages.length} messages`);
      
      if (onProgress) {
        onProgress({
          current: messages.length,
          total: messages.length,
          percent: 100
        });
      }
      
      return messages;
      
    } catch (error: any) {
      console.error('[ChatDownloader] Error downloading chat:', error);
      throw new Error(`Échec du téléchargement du chat: ${error.message}`);
    }
  }
  
  /**
   * Récupère un batch de messages du chat
   */
  private static async fetchChatBatch(vodId: string, cursor: string | null): Promise<any> {
    const query = `
      query VideoComments($videoID: ID!, $cursor: Cursor) {
        video(id: $videoID) {
          comments(first: 100, cursor: $cursor) {
            edges {
              cursor
              node {
                contentOffsetSeconds
                commenter {
                  login
                  displayName
                }
                message {
                  userColor
                  userBadges {
                    setID
                    version
                  }
                  fragments {
                    text
                    emote {
                      emoteID
                    }
                  }
                }
              }
            }
            pageInfo {
              hasNextPage
            }
          }
        }
      }
    `;
    
    const variables = {
      videoID: vodId,
      cursor: cursor
    };
    
    const response = await fetch(this.GQL_ENDPOINT, {
      method: 'POST',
      headers: {
        'Client-ID': this.CLIENT_ID,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ query, variables })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    return await response.json();
  }
  
  /**
   * Extrait le texte du message depuis les fragments
   */
  private static extractMessageText(messageData: any): string {
    if (!messageData?.fragments) return '';
    
    return messageData.fragments
      .map((fragment: any) => fragment.text || '')
      .join('');
  }
  
  /**
   * Extrait les badges de l'utilisateur
   */
  private static extractBadges(userBadges: any[]): string[] {
    if (!Array.isArray(userBadges)) return [];
    
    return userBadges
      .map((badge: any) => badge.setID || '')
      .filter((id: string) => id.length > 0);
  }
  
  /**
   * Extrait les emotes du message
   */
  private static extractEmotes(fragments: any[]): Array<{ name: string; id: string }> {
    if (!Array.isArray(fragments)) return [];
    
    return fragments
      .filter((fragment: any) => fragment.emote)
      .map((fragment: any) => ({
        name: fragment.text || '',
        id: fragment.emote.emoteID || ''
      }));
  }
  
  /**
   * Utilitaire pour ajouter un délai
   */
  private static delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * Convertit les messages du chat en format WebVTT (sous-titres)
   * WebVTT est supporté nativement par VLC et autres lecteurs
   */
  static convertToWebVTT(messages: ChatMessage[]): string {
    let vtt = 'WEBVTT\n';
    vtt += 'Kind: captions\n';
    vtt += 'Language: fr\n\n';
    
    // Grouper les messages par intervalles de 2 secondes pour éviter trop de sous-titres
    const groupedMessages = this.groupMessagesByInterval(messages, 2);
    
    for (const group of groupedMessages) {
      const startTime = this.formatTimestamp(group.startTime);
      const endTime = this.formatTimestamp(group.endTime);
      
      vtt += `${startTime} --> ${endTime}\n`;
      
      // Afficher jusqu'à 3 messages par groupe
      const displayMessages = group.messages.slice(0, 3);
      
      for (const msg of displayMessages) {
        // Formater le message avec couleur et badges
        const badgesStr = msg.badges.length > 0 ? `[${msg.badges.join(',')}] ` : '';
        const colorHex = msg.userColor || '#FFFFFF';
        
        // WebVTT supporte les couleurs avec la balise <c>
        vtt += `<c.${this.sanitizeColorClass(colorHex)}>${badgesStr}${msg.username}</c>: ${this.escapeVTT(msg.message)}\n`;
      }
      
      if (group.messages.length > 3) {
        vtt += `<i>... et ${group.messages.length - 3} autres messages</i>\n`;
      }
      
      vtt += '\n';
    }
    
    return vtt;
  }
  
  /**
   * Groupe les messages par intervalles de temps
   */
  private static groupMessagesByInterval(
    messages: ChatMessage[],
    intervalSeconds: number
  ): Array<{ startTime: number; endTime: number; messages: ChatMessage[] }> {
    if (messages.length === 0) return [];
    
    // Trier les messages par timestamp
    const sorted = [...messages].sort((a, b) => a.timestamp - b.timestamp);
    
    const groups: Array<{ startTime: number; endTime: number; messages: ChatMessage[] }> = [];
    let currentGroup: ChatMessage[] = [];
    let groupStartTime = Math.floor(sorted[0].timestamp / intervalSeconds) * intervalSeconds;
    
    for (const msg of sorted) {
      const msgInterval = Math.floor(msg.timestamp / intervalSeconds) * intervalSeconds;
      
      if (msgInterval !== groupStartTime) {
        // Créer un groupe avec les messages actuels
        if (currentGroup.length > 0) {
          groups.push({
            startTime: groupStartTime,
            endTime: groupStartTime + intervalSeconds,
            messages: currentGroup
          });
        }
        
        // Commencer un nouveau groupe
        currentGroup = [msg];
        groupStartTime = msgInterval;
      } else {
        currentGroup.push(msg);
      }
    }
    
    // Ajouter le dernier groupe
    if (currentGroup.length > 0) {
      groups.push({
        startTime: groupStartTime,
        endTime: groupStartTime + intervalSeconds,
        messages: currentGroup
      });
    }
    
    return groups;
  }
  
  /**
   * Formate un timestamp en secondes au format WebVTT (HH:MM:SS.mmm)
   */
  private static formatTimestamp(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const millis = Math.floor((seconds % 1) * 1000);
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${millis.toString().padStart(3, '0')}`;
  }
  
  /**
   * Sanitize une couleur hexadécimale pour l'utiliser comme classe CSS
   */
  private static sanitizeColorClass(color: string): string {
    return color.replace(/[^a-zA-Z0-9]/g, '');
  }
  
  /**
   * Échappe les caractères spéciaux pour WebVTT
   */
  private static escapeVTT(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, ' ');
  }
  
  /**
   * Convertit les messages en format ASS (Advanced SubStation Alpha)
   * Plus de contrôle sur le style et la position
   */
  static convertToASS(messages: ChatMessage[]): string {
    let ass = '[Script Info]\n';
    ass += 'Title: Twitch Chat Replay\n';
    ass += 'ScriptType: v4.00+\n';
    ass += 'Collisions: Normal\n';
    ass += 'PlayDepth: 0\n\n';
    
    ass += '[V4+ Styles]\n';
    ass += 'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n';
    ass += 'Style: Default,Arial,20,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,2,0,2,10,10,10,1\n\n';
    
    ass += '[Events]\n';
    ass += 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n';
    
    const groupedMessages = this.groupMessagesByInterval(messages, 2);
    
    for (const group of groupedMessages) {
      const startTime = this.formatASSTimestamp(group.startTime);
      const endTime = this.formatASSTimestamp(group.endTime);
      
      const displayMessages = group.messages.slice(0, 3);
      const lines: string[] = [];
      
      for (const msg of displayMessages) {
        const badgesStr = msg.badges.length > 0 ? `[${msg.badges.join(',')}] ` : '';
        const colorASS = this.hexToASSColor(msg.userColor);
        lines.push(`{\\c${colorASS}}${badgesStr}${msg.username}{\\c&HFFFFFF&}: ${this.escapeASS(msg.message)}`);
      }
      
      if (group.messages.length > 3) {
        lines.push(`{\\i1}... et ${group.messages.length - 3} autres messages{\\i0}`);
      }
      
      const text = lines.join('\\N');
      ass += `Dialogue: 0,${startTime},${endTime},Default,,0,0,0,,${text}\n`;
    }
    
    return ass;
  }
  
  /**
   * Formate un timestamp pour le format ASS (H:MM:SS.CC)
   */
  private static formatASSTimestamp(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const centisecs = Math.floor((seconds % 1) * 100);
    
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${centisecs.toString().padStart(2, '0')}`;
  }
  
  /**
   * Convertit une couleur hexadécimale en format ASS (&HAABBGGRR)
   */
  private static hexToASSColor(hex: string): string {
    // Enlever le # si présent
    hex = hex.replace('#', '');
    
    // Si la couleur est en format court, l'étendre
    if (hex.length === 3) {
      hex = hex.split('').map(c => c + c).join('');
    }
    
    // Extraire RGB
    const r = hex.substring(0, 2);
    const g = hex.substring(2, 4);
    const b = hex.substring(4, 6);
    
    // Format ASS: &HAABBGGRR (BGR au lieu de RGB)
    return `&H00${b}${g}${r}`;
  }
  
  /**
   * Échappe les caractères spéciaux pour ASS
   */
  private static escapeASS(text: string): string {
    return text
      .replace(/\\/g, '\\\\')
      .replace(/\n/g, '\\N')
      .replace(/{/g, '\\{')
      .replace(/}/g, '\\}');
  }
}
