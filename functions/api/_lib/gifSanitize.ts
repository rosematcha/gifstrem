/**
 * GIF sanitization utilities to strip metadata and validate file integrity.
 * Helps prevent malicious payloads, steganography, and other security risks.
 */

/**
 * GIF file structure constants
 */
const GIF_HEADER_87A = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x37, 0x61]); // "GIF87a"
const GIF_HEADER_89A = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]); // "GIF89a"
const GIF_TRAILER = 0x3B; // Trailer byte that marks end of GIF
const EXTENSION_INTRODUCER = 0x21;
const IMAGE_SEPARATOR = 0x2C;
const GRAPHIC_CONTROL_LABEL = 0xF9;
const COMMENT_LABEL = 0xFE;
const APPLICATION_LABEL = 0xFF;
const PLAIN_TEXT_LABEL = 0x01;

export type GifSanitizationResult = {
  sanitized: Uint8Array;
  removedBytes: number;
  warnings: string[];
};

/**
 * Validate and sanitize a GIF file.
 * - Validates GIF header
 * - Removes comment blocks
 * - Strips application extensions (except Netscape for animations)
 * - Removes plain text extensions
 * - Validates file structure
 * - Ensures proper trailer
 */
export async function sanitizeGif(file: File): Promise<GifSanitizationResult> {
  const buffer = await file.arrayBuffer();
  const data = new Uint8Array(buffer);
  const warnings: string[] = [];
  let removedBytes = 0;

  // Validate GIF header
  if (!isValidGifHeader(data)) {
    throw new Error('Invalid GIF file: Missing or corrupted GIF header');
  }

  // Check file size limits
  if (data.length < 13) {
    throw new Error('Invalid GIF file: File too small');
  }

  if (data.length > 10 * 1024 * 1024) {
    throw new Error('GIF file too large for sanitization (max 10MB)');
  }

  // Parse and sanitize
  const result: number[] = [];
  let position = 0;

  // Copy header (6 bytes: "GIF89a" or "GIF87a")
  for (let i = 0; i < 6; i++) {
    result.push(data[position++]);
  }

  // Copy Logical Screen Descriptor (7 bytes)
  if (position + 7 > data.length) {
    throw new Error('Invalid GIF: Incomplete Logical Screen Descriptor');
  }
  
  for (let i = 0; i < 7; i++) {
    result.push(data[position++]);
  }

  // Check for Global Color Table
  const packed = data[10];
  const hasGlobalColorTable = (packed & 0x80) !== 0;
  const globalColorTableSize = hasGlobalColorTable ? 3 * Math.pow(2, (packed & 0x07) + 1) : 0;

  // Copy Global Color Table if present
  if (globalColorTableSize > 0) {
    if (position + globalColorTableSize > data.length) {
      throw new Error('Invalid GIF: Incomplete Global Color Table');
    }
    for (let i = 0; i < globalColorTableSize; i++) {
      result.push(data[position++]);
    }
  }

  // Process data blocks
  let frameCount = 0;
  let hasTrailer = false;

  while (position < data.length && !hasTrailer) {
    const byte = data[position];

    if (byte === GIF_TRAILER) {
      // Found trailer - end of GIF
      result.push(data[position++]);
      hasTrailer = true;
      
      // Check for data after trailer (potential steganography)
      if (position < data.length) {
        const extraBytes = data.length - position;
        removedBytes += extraBytes;
        warnings.push(`Removed ${extraBytes} bytes of data after GIF trailer (potential steganography)`);
      }
      break;
    } else if (byte === EXTENSION_INTRODUCER) {
      // Extension block
      position++;
      if (position >= data.length) {
        throw new Error('Invalid GIF: Incomplete extension block');
      }

      const label = data[position++];
      
      if (label === GRAPHIC_CONTROL_LABEL) {
        // Graphic Control Extension - keep it (needed for animations)
        result.push(EXTENSION_INTRODUCER);
        result.push(label);
        const blockSize = data[position++];
        result.push(blockSize);
        
        for (let i = 0; i < blockSize; i++) {
          if (position >= data.length) throw new Error('Invalid GIF: Incomplete graphic control block');
          result.push(data[position++]);
        }
        
        // Block terminator
        if (position >= data.length) throw new Error('Invalid GIF: Missing block terminator');
        result.push(data[position++]);
        
      } else if (label === APPLICATION_LABEL) {
        // Application Extension - only keep NETSCAPE2.0 (for looping)
        const startPos = position - 2;
        const blockSize = data[position++];
        const appData = data.slice(position, position + blockSize);
        
        // Check if it's NETSCAPE2.0
        const netscapeId = 'NETSCAPE2.0';
        const isNetscape = appData.length >= netscapeId.length && 
          String.fromCharCode(...appData.slice(0, netscapeId.length)) === netscapeId;
        
        if (isNetscape) {
          // Keep Netscape extension for animation looping
          result.push(EXTENSION_INTRODUCER);
          result.push(label);
          result.push(blockSize);
          for (let i = 0; i < blockSize; i++) {
            result.push(data[position++]);
          }
          // Copy sub-blocks
          position = copyDataSubBlocks(data, position, result);
        } else {
          // Remove other application extensions
          position += blockSize;
          const subBlockStart = position;
          position = skipDataSubBlocks(data, position);
          const removed = position - startPos;
          removedBytes += removed;
          warnings.push(`Removed ${removed} bytes of application extension data`);
        }
        
      } else if (label === COMMENT_LABEL) {
        // Comment Extension - remove it (can contain metadata or malicious content)
        const startPos = position - 2;
        position = skipDataSubBlocks(data, position);
        const removed = position - startPos;
        removedBytes += removed;
        warnings.push(`Removed ${removed} bytes of comment data`);
        
      } else if (label === PLAIN_TEXT_LABEL) {
        // Plain Text Extension - remove it (rarely used, potential attack vector)
        const startPos = position - 2;
        const blockSize = data[position++];
        position += blockSize;
        position = skipDataSubBlocks(data, position);
        const removed = position - startPos;
        removedBytes += removed;
        warnings.push(`Removed ${removed} bytes of plain text extension`);
        
      } else {
        // Unknown extension - remove it to be safe
        const startPos = position - 2;
        position = skipDataSubBlocks(data, position);
        const removed = position - startPos;
        removedBytes += removed;
        warnings.push(`Removed ${removed} bytes of unknown extension (label: 0x${label.toString(16)})`);
      }
      
    } else if (byte === IMAGE_SEPARATOR) {
      // Image Descriptor
      frameCount++;
      result.push(data[position++]);
      
      // Copy Image Descriptor (9 bytes)
      if (position + 9 > data.length) {
        throw new Error('Invalid GIF: Incomplete image descriptor');
      }
      
      for (let i = 0; i < 9; i++) {
        result.push(data[position++]);
      }
      
      // Check for Local Color Table
      const localPacked = data[position - 1];
      const hasLocalColorTable = (localPacked & 0x80) !== 0;
      const localColorTableSize = hasLocalColorTable ? 3 * Math.pow(2, (localPacked & 0x07) + 1) : 0;
      
      // Copy Local Color Table if present
      if (localColorTableSize > 0) {
        if (position + localColorTableSize > data.length) {
          throw new Error('Invalid GIF: Incomplete local color table');
        }
        for (let i = 0; i < localColorTableSize; i++) {
          result.push(data[position++]);
        }
      }
      
      // Copy LZW minimum code size
      if (position >= data.length) {
        throw new Error('Invalid GIF: Missing LZW minimum code size');
      }
      result.push(data[position++]);
      
      // Copy image data sub-blocks
      position = copyDataSubBlocks(data, position, result);
      
    } else {
      // Unexpected byte - could be corrupted or malicious
      throw new Error(`Invalid GIF structure: Unexpected byte 0x${byte.toString(16)} at position ${position}`);
    }
  }

  // Ensure trailer is present
  if (!hasTrailer) {
    warnings.push('Added missing GIF trailer');
    result.push(GIF_TRAILER);
  }

  // Validate frame count
  if (frameCount === 0) {
    throw new Error('Invalid GIF: No image frames found');
  }

  if (frameCount > 1000) {
    throw new Error('Invalid GIF: Too many frames (max 1000)');
  }

  return {
    sanitized: new Uint8Array(result),
    removedBytes,
    warnings,
  };
}

/**
 * Check if data starts with valid GIF header
 */
function isValidGifHeader(data: Uint8Array): boolean {
  if (data.length < 6) return false;
  
  const header = data.slice(0, 6);
  return arraysEqual(header, GIF_HEADER_87A) || arraysEqual(header, GIF_HEADER_89A);
}

/**
 * Compare two Uint8Arrays for equality
 */
function arraysEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Skip data sub-blocks (used for removing extensions)
 */
function skipDataSubBlocks(data: Uint8Array, position: number): number {
  while (position < data.length) {
    const blockSize = data[position++];
    if (blockSize === 0) break; // Block terminator
    position += blockSize;
    if (position > data.length) {
      throw new Error('Invalid GIF: Data sub-blocks extend beyond file');
    }
  }
  return position;
}

/**
 * Copy data sub-blocks to result array
 */
function copyDataSubBlocks(data: Uint8Array, position: number, result: number[]): number {
  while (position < data.length) {
    const blockSize = data[position];
    result.push(blockSize);
    position++;
    
    if (blockSize === 0) break; // Block terminator
    
    if (position + blockSize > data.length) {
      throw new Error('Invalid GIF: Data sub-blocks extend beyond file');
    }
    
    for (let i = 0; i < blockSize; i++) {
      result.push(data[position++]);
    }
  }
  return position;
}

/**
 * Quick validation check without full sanitization
 */
export function validateGifStructure(data: Uint8Array): { valid: boolean; error?: string } {
  try {
    if (!isValidGifHeader(data)) {
      return { valid: false, error: 'Invalid GIF header' };
    }
    
    if (data.length < 13) {
      return { valid: false, error: 'File too small' };
    }
    
    // Check for trailer
    let hasTrailer = false;
    for (let i = data.length - 1; i >= Math.max(0, data.length - 100); i--) {
      if (data[i] === GIF_TRAILER) {
        hasTrailer = true;
        break;
      }
    }
    
    if (!hasTrailer) {
      return { valid: false, error: 'Missing GIF trailer' };
    }
    
    return { valid: true };
  } catch (error) {
    return { valid: false, error: (error as Error).message };
  }
}

/**
 * Get basic GIF information without sanitizing
 */
export function getGifInfo(data: Uint8Array): {
  width: number;
  height: number;
  hasGlobalColorTable: boolean;
  isAnimated: boolean;
} {
  if (data.length < 13) {
    throw new Error('Invalid GIF: File too small');
  }
  
  // Width and height are at bytes 6-9 (little-endian)
  const width = data[6] | (data[7] << 8);
  const height = data[8] | (data[9] << 8);
  
  // Global Color Table flag in packed field at byte 10
  const packed = data[10];
  const hasGlobalColorTable = (packed & 0x80) !== 0;
  
  // Check for multiple frames (simple heuristic: look for multiple image separators)
  let imageCount = 0;
  for (let i = 13; i < data.length; i++) {
    if (data[i] === IMAGE_SEPARATOR) {
      imageCount++;
      if (imageCount > 1) break;
    }
  }
  
  return {
    width,
    height,
    hasGlobalColorTable,
    isAnimated: imageCount > 1,
  };
}
