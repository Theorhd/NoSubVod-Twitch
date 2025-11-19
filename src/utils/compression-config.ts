/**
 * Compression Configuration Helper
 * Maps storage compression types to video compressor settings
 */

import { CompressionType } from './storage';
import { CompressionLevel, CompressionMode } from './video-compressor';

export interface CompressionConfig {
  level: CompressionLevel;
  mode: CompressionMode;
  enabled: boolean;
}

/**
 * Convert storage compression type to compressor configuration
 */
export function getCompressionConfig(
  compressionEnabled: boolean,
  compressionType: CompressionType
): CompressionConfig {
  if (!compressionEnabled || compressionType === 'none') {
    return {
      level: CompressionLevel.NONE,
      mode: CompressionMode.LOSSLESS,
      enabled: false
    };
  }

  if (compressionType === 'lossless') {
    return {
      level: CompressionLevel.BALANCED,
      mode: CompressionMode.LOSSLESS,
      enabled: true
    };
  }

  // compressionType === 'lossy'
  return {
    level: CompressionLevel.BALANCED,
    mode: CompressionMode.LOSSY,
    enabled: true
  };
}

/**
 * Get human-readable description of compression settings
 */
export function getCompressionDescription(config: CompressionConfig): string {
  if (!config.enabled) {
    return 'Aucune compression';
  }

  const modeStr = config.mode === CompressionMode.LOSSLESS ? 'LossLess' : 'Lossy';
  const levelStr = CompressionLevel[config.level];
  
  return `${modeStr} - ${levelStr}`;
}

/**
 * Estimate final file size after compression
 */
export function estimateCompressedSize(
  originalSize: number,
  config: CompressionConfig
): number {
  if (!config.enabled) {
    return originalSize;
  }

  // Estimation basée sur les ratios de compression
  let ratio = 1.0;
  
  if (config.mode === CompressionMode.LOSSLESS) {
    switch (config.level) {
      case CompressionLevel.FAST:
        ratio = 0.85;
        break;
      case CompressionLevel.BALANCED:
        ratio = 0.75;
        break;
      case CompressionLevel.MAXIMUM:
        ratio = 0.65;
        break;
    }
  } else {
    // Lossy mode
    switch (config.level) {
      case CompressionLevel.FAST:
        ratio = 0.70;
        break;
      case CompressionLevel.BALANCED:
        ratio = 0.60;
        break;
      case CompressionLevel.MAXIMUM:
        ratio = 0.50;
        break;
    }
  }

  return Math.floor(originalSize * ratio);
}
