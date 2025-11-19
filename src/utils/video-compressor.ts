/**
 * Video Compressor Utility
 * Compresses video segments to reduce file size with multiple optimization strategies
 */

export enum CompressionLevel {
  NONE = 0,      // Pas de compression
  FAST = 1,      // Rapide, suppression basique (LossLess mode)
  BALANCED = 2,  // Équilibré entre vitesse et taille (LossLess mode)
  MAXIMUM = 3    // Compression maximale (LossLess mode)
}

export enum CompressionMode {
  LOSSLESS = 'lossless',  // Sans perte de qualité
  LOSSY = 'lossy'         // Avec perte de qualité pour plus de compression
}

interface CompressionStats {
  originalSize: number;
  compressedSize: number;
  ratio: number;
  duration: number;
  method: string;
  mode: CompressionMode;
}

export class VideoCompressor {
  private static readonly TS_PACKET_SIZE = 188;
  private static readonly SYNC_BYTE = 0x47;
  private static readonly NULL_PID = 0x1FFF;
  private static readonly MIN_SIZE_FOR_COMPRESSION = 50 * 1024; // 50 KB
  private static readonly CHUNK_SIZE = 1024 * 1024; // 1 MB chunks pour traitement

  /**
   * Compress a video segment with specified compression level and mode
   */
  static async compressSegment(
    buffer: ArrayBuffer,
    level: CompressionLevel = CompressionLevel.BALANCED,
    mode: CompressionMode = CompressionMode.LOSSLESS
  ): Promise<ArrayBuffer> {
    const startTime = performance.now();

    if (level === CompressionLevel.NONE || !this.shouldCompress(buffer.byteLength)) {
      return buffer;
    }

    let result: ArrayBuffer;
    
    if (mode === CompressionMode.LOSSY) {
      result = await this.lossyCompression(buffer, level);
    } else {
      // LossLess mode
      switch (level) {
        case CompressionLevel.FAST:
          result = this.fastCompression(buffer);
          break;
        case CompressionLevel.BALANCED:
          result = await this.balancedCompression(buffer);
          break;
        case CompressionLevel.MAXIMUM:
          result = await this.maximumCompression(buffer);
          break;
        default:
          result = buffer;
      }
    }

    const duration = performance.now() - startTime;
    const stats: CompressionStats = {
      originalSize: buffer.byteLength,
      compressedSize: result.byteLength,
      ratio: result.byteLength / buffer.byteLength,
      duration,
      method: CompressionLevel[level],
      mode
    };

    if (console.log && duration > 100) {
      console.log(`[NSV Compressor ${mode.toUpperCase()}] ${(stats.originalSize / 1024 / 1024).toFixed(2)}MB → ${(stats.compressedSize / 1024 / 1024).toFixed(2)}MB (${((1 - stats.ratio) * 100).toFixed(1)}% reduction) in ${duration.toFixed(0)}ms`);
    }

    return result;
  }

  /**
   * Fast compression: suppression des paquets null uniquement
   */
  private static fastCompression(buffer: ArrayBuffer): ArrayBuffer {
    return this.removeNullPackets(buffer);
  }

  /**
   * Balanced compression: suppression null uniquement (SAFE)
   * Note: Les autres optimisations (adaptation fields, PAT/PMT) sont désactivées
   * car elles peuvent corrompre la structure TS et rendre le fichier illisible
   */
  private static async balancedCompression(buffer: ArrayBuffer): Promise<ArrayBuffer> {
    // Seule la suppression des paquets NULL est sûre
    return this.removeNullPackets(buffer);
  }

  /**
   * Maximum compression: suppression null uniquement (SAFE)
   * Note: La déduplication et l'optimisation des adaptation fields sont désactivées
   * car elles peuvent corrompre la structure TS
   */
  private static async maximumCompression(buffer: ArrayBuffer): Promise<ArrayBuffer> {
    // Seule la suppression des paquets NULL est sûre
    return this.removeNullPackets(buffer);
  }

  /**
   * Lossy compression: suppression null uniquement (SAFE)
   * Note: Les optimisations agressives sont désactivées car elles corrompent le flux TS
   * La vraie compression lossy nécessiterait un ré-encodage avec ffmpeg/libav
   */
  private static async lossyCompression(buffer: ArrayBuffer, level: CompressionLevel): Promise<ArrayBuffer> {
    // Pour l'instant, même comportement que lossless pour éviter la corruption
    return this.removeNullPackets(buffer);
  }

  /**
   * Réduction agressive des adaptation fields pour compression lossy
   * Réduit les adaptation fields au minimum absolu, même si cela peut affecter
   * la compatibilité avec certains players ou causer des micro-saccades
   */
  private static aggressiveAdaptationFieldReduction(buffer: ArrayBuffer): ArrayBuffer {
    const view = new Uint8Array(buffer);
    const optimizedPackets: Uint8Array[] = [];
    
    for (let i = 0; i < view.length; i += this.TS_PACKET_SIZE) {
      if (i + this.TS_PACKET_SIZE > view.length) break;
      
      const packet = new Uint8Array(view.subarray(i, i + this.TS_PACKET_SIZE));
      
      if (packet[0] !== this.SYNC_BYTE) continue;
      
      // Vérifier si le paquet a un adaptation field
      const adaptationFieldControl = (packet[3] >> 4) & 0x03;
      const hasAdaptation = (adaptationFieldControl === 0x02 || adaptationFieldControl === 0x03);
      
      if (hasAdaptation && packet.length > 4) {
        const adaptationLength = packet[4];
        
        // Réduction agressive: garder seulement 5 bytes minimum
        if (adaptationLength > 5) {
          const newPacket = new Uint8Array(this.TS_PACKET_SIZE);
          
          // Copier header
          newPacket.set(packet.subarray(0, 4), 0);
          
          // Nouvelle longueur minimale
          const minAdaptationLength = 5;
          newPacket[4] = minAdaptationLength;
          
          // Copier seulement les flags essentiels (premier byte d'adaptation)
          if (adaptationLength > 0) {
            newPacket[5] = packet[5];
          }
          
          // Remplir le reste avec padding
          newPacket.fill(0xFF, 6, 5 + minAdaptationLength);
          
          // Copier payload si présent
          if (adaptationFieldControl === 0x03) {
            const oldPayloadStart = 5 + adaptationLength;
            const newPayloadStart = 5 + minAdaptationLength;
            
            if (oldPayloadStart < packet.length) {
              const payloadLength = Math.min(
                packet.length - oldPayloadStart,
                this.TS_PACKET_SIZE - newPayloadStart
              );
              
              if (payloadLength > 0) {
                newPacket.set(
                  packet.subarray(oldPayloadStart, oldPayloadStart + payloadLength),
                  newPayloadStart
                );
              }
            }
          }
          
          optimizedPackets.push(newPacket);
          continue;
        }
      }
      
      optimizedPackets.push(packet);
    }
    
    if (optimizedPackets.length === 0) {
      return buffer;
    }
    
    const result = new Uint8Array(optimizedPackets.length * this.TS_PACKET_SIZE);
    optimizedPackets.forEach((packet, index) => {
      result.set(packet, index * this.TS_PACKET_SIZE);
    });
    
    return result.buffer;
  }

  /**
   * Réduit la redondance des tables PAT/PMT
   * Les tables PAT (Program Association Table) et PMT (Program Map Table) sont
   * souvent répétées toutes les quelques paquets. On peut réduire leur fréquence.
   */
  private static reducePATPMTRedundancy(buffer: ArrayBuffer): ArrayBuffer {
    const view = new Uint8Array(buffer);
    const optimizedPackets: Uint8Array[] = [];
    let lastPATIndex = -100;
    let lastPMTIndex = -100;
    const MIN_PAT_PMT_DISTANCE = 50; // Garder seulement 1 PAT/PMT tous les 50 paquets
    
    for (let i = 0, packetIndex = 0; i < view.length; i += this.TS_PACKET_SIZE, packetIndex++) {
      if (i + this.TS_PACKET_SIZE > view.length) break;
      
      const packet = view.subarray(i, i + this.TS_PACKET_SIZE);
      
      if (packet[0] !== this.SYNC_BYTE) continue;
      
      const pid = ((packet[1] & 0x1F) << 8) | packet[2];
      
      // PID 0x0000 = PAT, PID 0x0001-0x001F sont souvent PMT
      const isPAT = (pid === 0x0000);
      const isPMT = (pid >= 0x0001 && pid <= 0x001F);
      
      if (isPAT) {
        // Garder seulement si assez de distance depuis le dernier PAT
        if (packetIndex - lastPATIndex < MIN_PAT_PMT_DISTANCE) {
          continue; // Skip ce paquet PAT redondant
        }
        lastPATIndex = packetIndex;
      } else if (isPMT) {
        // Garder seulement si assez de distance depuis le dernier PMT
        if (packetIndex - lastPMTIndex < MIN_PAT_PMT_DISTANCE) {
          continue; // Skip ce paquet PMT redondant
        }
        lastPMTIndex = packetIndex;
      }
      
      optimizedPackets.push(new Uint8Array(packet));
    }
    
    if (optimizedPackets.length === 0) {
      return buffer;
    }
    
    const result = new Uint8Array(optimizedPackets.length * this.TS_PACKET_SIZE);
    optimizedPackets.forEach((packet, index) => {
      result.set(packet, index * this.TS_PACKET_SIZE);
    });
    
    return result.buffer;
  }

  /**
   * Remove null packets (PID 0x1FFF) - basic optimization
   */
  private static removeNullPackets(buffer: ArrayBuffer): ArrayBuffer {
    const view = new Uint8Array(buffer);
    const packets: Uint8Array[] = [];
    let removedCount = 0;
    let invalidPackets = 0;
    
    for (let i = 0; i < view.length; i += this.TS_PACKET_SIZE) {
      if (i + this.TS_PACKET_SIZE > view.length) break;
      
      const packet = view.subarray(i, i + this.TS_PACKET_SIZE);
      
      // Vérifier sync byte
      if (packet[0] !== this.SYNC_BYTE) {
        // Invalid sync byte - this shouldn't happen in a valid TS stream
        invalidPackets++;
        // Keep the packet anyway to avoid breaking the stream
        packets.push(new Uint8Array(packet));
        continue;
      }
      
      // Extraire PID (13 bits depuis bytes 1-2)
      const pid = ((packet[1] & 0x1F) << 8) | packet[2];
      
      // Garder uniquement les paquets non-null
      if (pid !== this.NULL_PID) {
        packets.push(new Uint8Array(packet));
      } else {
        removedCount++;
      }
    }
    
    if (invalidPackets > 0) {
      console.warn(`[NSV Compressor] Found ${invalidPackets} packets with invalid sync byte - keeping them to preserve stream`);
    }
    
    if (packets.length === 0) {
      console.warn('[NSV Compressor] All packets removed - returning original buffer');
      return buffer;
    }
    
    // Réassembler
    const compressed = new Uint8Array(packets.length * this.TS_PACKET_SIZE);
    packets.forEach((packet, index) => {
      compressed.set(packet, index * this.TS_PACKET_SIZE);
    });
    
    if (removedCount > 0 && console.log) {
      console.log(`[NSV Compressor] Removed ${removedCount} NULL packets, kept ${packets.length} packets`);
    }
    
    return compressed.buffer;
  }

  /**
   * Optimize adaptation fields by removing excessive padding
   * L'adaptation field peut contenir beaucoup de padding (0xFF) inutile
   */
  private static optimizeAdaptationFields(buffer: ArrayBuffer): ArrayBuffer {
    const view = new Uint8Array(buffer);
    const optimizedPackets: Uint8Array[] = [];
    
    for (let i = 0; i < view.length; i += this.TS_PACKET_SIZE) {
      if (i + this.TS_PACKET_SIZE > view.length) break;
      
      const packet = new Uint8Array(view.subarray(i, i + this.TS_PACKET_SIZE));
      
      if (packet[0] !== this.SYNC_BYTE) continue;
      
      // Vérifier si le paquet a un adaptation field
      const adaptationFieldControl = (packet[3] >> 4) & 0x03;
      const hasAdaptation = (adaptationFieldControl === 0x02 || adaptationFieldControl === 0x03);
      
      if (hasAdaptation && packet.length > 4) {
        const adaptationLength = packet[4];
        
        // Si l'adaptation field est très long et contient beaucoup de padding
        if (adaptationLength > 100) {
          // Compter les bytes de padding (0xFF)
          let paddingStart = 5;
          let actualDataLength = 0;
          
          // Trouver où commence le padding
          for (let j = 5; j < 5 + adaptationLength && j < packet.length; j++) {
            if (packet[j] === 0xFF) {
              break;
            }
            actualDataLength++;
          }
          
          // Si on peut réduire le padding de plus de 50 bytes
          if (adaptationLength - actualDataLength > 50) {
            // Créer un nouveau paquet optimisé
            const newAdaptationLength = actualDataLength + 10; // Garder un peu de padding
            const newPacket = new Uint8Array(this.TS_PACKET_SIZE);
            
            // Copier header (4 bytes)
            newPacket.set(packet.subarray(0, 4), 0);
            
            // Nouvelle longueur d'adaptation
            newPacket[4] = newAdaptationLength;
            
            // Copier les données réelles de l'adaptation field
            newPacket.set(packet.subarray(5, 5 + actualDataLength), 5);
            
            // Remplir le reste avec padding
            newPacket.fill(0xFF, 5 + actualDataLength, 5 + newAdaptationLength);
            
            // Copier le payload si présent
            if (adaptationFieldControl === 0x03) {
              const oldPayloadStart = 5 + adaptationLength;
              const newPayloadStart = 5 + newAdaptationLength;
              const payloadLength = this.TS_PACKET_SIZE - oldPayloadStart;
              
              if (oldPayloadStart < packet.length && payloadLength > 0) {
                newPacket.set(
                  packet.subarray(oldPayloadStart, oldPayloadStart + payloadLength),
                  newPayloadStart
                );
              }
            }
            
            optimizedPackets.push(newPacket);
            continue;
          }
        }
      }
      
      optimizedPackets.push(packet);
    }
    
    if (optimizedPackets.length === 0) {
      return buffer;
    }
    
    const result = new Uint8Array(optimizedPackets.length * this.TS_PACKET_SIZE);
    optimizedPackets.forEach((packet, index) => {
      result.set(packet, index * this.TS_PACKET_SIZE);
    });
    
    return result.buffer;
  }

  /**
   * Deduplicate consecutive identical packets (rare but possible)
   */
  private static deduplicatePackets(buffer: ArrayBuffer): ArrayBuffer {
    const view = new Uint8Array(buffer);
    const uniquePackets: Uint8Array[] = [];
    let lastPacket: Uint8Array | null = null;
    let duplicateCount = 0;
    
    for (let i = 0; i < view.length; i += this.TS_PACKET_SIZE) {
      if (i + this.TS_PACKET_SIZE > view.length) break;
      
      const packet = view.subarray(i, i + this.TS_PACKET_SIZE);
      
      if (packet[0] !== this.SYNC_BYTE) continue;
      
      // Comparer avec le paquet précédent
      if (lastPacket && this.arePacketsIdentical(lastPacket, packet)) {
        duplicateCount++;
        continue;
      }
      
      uniquePackets.push(new Uint8Array(packet));
      lastPacket = packet;
    }
    
    if (duplicateCount > 0 && console.log) {
      console.log(`[NSV Compressor] Removed ${duplicateCount} duplicate packets`);
    }
    
    if (uniquePackets.length === 0) {
      return buffer;
    }
    
    const result = new Uint8Array(uniquePackets.length * this.TS_PACKET_SIZE);
    uniquePackets.forEach((packet, index) => {
      result.set(packet, index * this.TS_PACKET_SIZE);
    });
    
    return result.buffer;
  }

  /**
   * Compare two TS packets for equality
   */
  private static arePacketsIdentical(packet1: Uint8Array, packet2: Uint8Array): boolean {
    if (packet1.length !== packet2.length) return false;
    
    for (let i = 0; i < packet1.length; i++) {
      if (packet1[i] !== packet2[i]) return false;
    }
    
    return true;
  }

  /**
   * Estimate compression ratio based on level and mode
   * Note: Actuellement, seule la suppression des paquets NULL est implémentée (safe)
   * Les ratios reflètent la quantité typique de paquets NULL dans les flux TS
   */
  static estimateCompressionRatio(level: CompressionLevel, mode: CompressionMode = CompressionMode.LOSSLESS): number {
    // Avec uniquement la suppression des NULL packets:
    // - Les flux Twitch ont généralement 5-15% de NULL packets
    // - Le gain est donc limité mais SAFE (pas de corruption)
    switch (level) {
      case CompressionLevel.NONE:
        return 1.0;
      case CompressionLevel.FAST:
      case CompressionLevel.BALANCED:
      case CompressionLevel.MAXIMUM:
        return 0.90; // ~10% reduction (estimation conservative)
      default:
        return 0.95;
    }
  }

  /**
   * Check if compression is beneficial
   */
  static shouldCompress(bufferSize: number): boolean {
    return bufferSize >= this.MIN_SIZE_FOR_COMPRESSION;
  }

  /**
   * Analyse un buffer TS et retourne des statistiques
   */
  static analyzeBuffer(buffer: ArrayBuffer): {
    totalPackets: number;
    nullPackets: number;
    dataPackets: number;
    averageAdaptationFieldSize: number;
    estimatedSavings: number;
  } {
    const view = new Uint8Array(buffer);
    let totalPackets = 0;
    let nullPackets = 0;
    let dataPackets = 0;
    let totalAdaptationSize = 0;
    let adaptationCount = 0;
    
    for (let i = 0; i < view.length; i += this.TS_PACKET_SIZE) {
      if (i + this.TS_PACKET_SIZE > view.length) break;
      
      const packet = view.subarray(i, i + this.TS_PACKET_SIZE);
      
      if (packet[0] !== this.SYNC_BYTE) continue;
      
      totalPackets++;
      
      const pid = ((packet[1] & 0x1F) << 8) | packet[2];
      
      if (pid === this.NULL_PID) {
        nullPackets++;
      } else {
        dataPackets++;
        
        // Vérifier adaptation field
        const adaptationFieldControl = (packet[3] >> 4) & 0x03;
        if (adaptationFieldControl === 0x02 || adaptationFieldControl === 0x03) {
          const adaptationLength = packet[4];
          totalAdaptationSize += adaptationLength;
          adaptationCount++;
        }
      }
    }
    
    const averageAdaptationFieldSize = adaptationCount > 0 ? totalAdaptationSize / adaptationCount : 0;
    const estimatedSavings = (nullPackets * this.TS_PACKET_SIZE) / buffer.byteLength;
    
    return {
      totalPackets,
      nullPackets,
      dataPackets,
      averageAdaptationFieldSize,
      estimatedSavings
    };
  }
}
