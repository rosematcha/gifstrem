/**
 * Input sanitization utilities for preventing XSS, injection attacks, and other security issues.
 * These functions should be used to sanitize all user-provided text inputs.
 */

/**
 * Sanitize a general text string by removing or encoding potentially dangerous characters.
 * This helps prevent XSS attacks and injection vulnerabilities.
 * 
 * - Removes null bytes
 * - Trims whitespace
 * - Normalizes Unicode characters
 * - Removes control characters (except newlines and tabs)
 * - Encodes HTML entities
 */
export function sanitizeText(input: string): string {
  if (typeof input !== 'string') {
    return '';
  }

  // Remove null bytes
  let sanitized = input.replace(/\0/g, '');
  
  // Normalize unicode
  sanitized = sanitized.normalize('NFC');
  
  // Remove control characters except newline and tab
  sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  
  // Trim whitespace
  sanitized = sanitized.trim();
  
  // Encode HTML entities to prevent XSS
  sanitized = encodeHtmlEntities(sanitized);
  
  return sanitized;
}

/**
 * Sanitize a slug (URL-friendly identifier).
 * - Converts to lowercase
 * - Removes all characters except a-z, 0-9, and hyphens
 * - Removes leading/trailing hyphens
 * - Collapses multiple consecutive hyphens
 */
export function sanitizeSlug(input: string): string {
  if (typeof input !== 'string') {
    return '';
  }

  let sanitized = input.toLowerCase().trim();
  
  // Remove null bytes and control characters
  sanitized = sanitized.replace(/[\x00-\x1F\x7F]/g, '');
  
  // Keep only alphanumeric and hyphens
  sanitized = sanitized.replace(/[^a-z0-9-]/g, '');
  
  // Collapse multiple hyphens
  sanitized = sanitized.replace(/-+/g, '-');
  
  // Remove leading/trailing hyphens
  sanitized = sanitized.replace(/^-+|-+$/g, '');
  
  return sanitized;
}

/**
 * Sanitize display names (usernames, uploader names, etc.).
 * More permissive than slug, allows spaces and common punctuation.
 * - Removes control characters and null bytes
 * - Trims whitespace
 * - Encodes HTML entities
 * - Normalizes whitespace (collapses multiple spaces)
 */
export function sanitizeDisplayName(input: string): string {
  if (typeof input !== 'string') {
    return '';
  }

  // Remove null bytes
  let sanitized = input.replace(/\0/g, '');
  
  // Normalize unicode
  sanitized = sanitized.normalize('NFC');
  
  // Remove control characters except space
  sanitized = sanitized.replace(/[\x00-\x1F\x7F]/g, '');
  
  // Trim and normalize whitespace
  sanitized = sanitized.trim().replace(/\s+/g, ' ');
  
  // Encode HTML entities
  sanitized = encodeHtmlEntities(sanitized);
  
  return sanitized;
}

/**
 * Sanitize message text (user comments, descriptions).
 * Allows newlines but prevents XSS and other attacks.
 * - Removes null bytes
 * - Removes dangerous control characters
 * - Encodes HTML entities
 * - Normalizes line breaks
 * - Trims whitespace
 */
export function sanitizeMessage(input: string): string {
  if (typeof input !== 'string') {
    return '';
  }

  // Remove null bytes
  let sanitized = input.replace(/\0/g, '');
  
  // Normalize unicode
  sanitized = sanitized.normalize('NFC');
  
  // Remove control characters except newline and carriage return
  sanitized = sanitized.replace(/[\x00-\x09\x0B\x0C\x0E-\x1F\x7F]/g, '');
  
  // Normalize line breaks (convert CRLF to LF)
  sanitized = sanitized.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  
  // Remove excessive consecutive newlines (max 2)
  sanitized = sanitized.replace(/\n{3,}/g, '\n\n');
  
  // Trim whitespace
  sanitized = sanitized.trim();
  
  // Encode HTML entities
  sanitized = encodeHtmlEntities(sanitized);
  
  return sanitized;
}

/**
 * Encode HTML entities to prevent XSS attacks.
 * Converts: < > & " ' / to their HTML entity equivalents
 */
function encodeHtmlEntities(input: string): string {
  const entityMap: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;',
  };
  
  return input.replace(/[&<>"'/]/g, (char) => entityMap[char] || char);
}

/**
 * Validate that a string doesn't contain SQL injection patterns.
 * This is defense-in-depth; parameterized queries are the primary defense.
 * Returns true if the input appears safe, false if suspicious patterns detected.
 */
export function validateNoSqlInjection(input: string): boolean {
  if (typeof input !== 'string') {
    return false;
  }

  // Common SQL injection patterns
  const suspiciousPatterns = [
    /('|(\\')|(;)|(--)|(\/\*)|(\*\/))/i,  // SQL metacharacters
    /(\bOR\b|\bAND\b).*[=<>]/i,           // Boolean logic in conditions
    /UNION.*SELECT/i,                      // UNION attacks
    /DROP\s+TABLE/i,                       // DROP commands
    /INSERT\s+INTO/i,                      // INSERT commands
    /DELETE\s+FROM/i,                      // DELETE commands
    /UPDATE\s+\w+\s+SET/i,                // UPDATE commands
    /EXEC(\s|\()/i,                        // EXEC commands
    /EXECUTE(\s|\()/i,                     // EXECUTE commands
    /SCRIPT.*>/i,                          // Script tags
    /javascript:/i,                        // JavaScript protocol
    /on\w+\s*=/i,                          // Event handlers
  ];

  return !suspiciousPatterns.some(pattern => pattern.test(input));
}

/**
 * Sanitize and validate an email address.
 * Returns the lowercased, trimmed email or empty string if invalid.
 */
export function sanitizeEmail(input: string): string {
  if (typeof input !== 'string') {
    return '';
  }

  // Basic sanitization
  let sanitized = input.trim().toLowerCase();
  
  // Remove control characters
  sanitized = sanitized.replace(/[\x00-\x1F\x7F]/g, '');
  
  // Basic email validation regex
  const emailRegex = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;
  
  if (!emailRegex.test(sanitized)) {
    return '';
  }
  
  return sanitized;
}

/**
 * Strip all HTML tags from input.
 * Useful for content that should never contain markup.
 */
export function stripHtmlTags(input: string): string {
  if (typeof input !== 'string') {
    return '';
  }

  // Remove HTML tags
  let sanitized = input.replace(/<[^>]*>/g, '');
  
  // Decode common HTML entities
  sanitized = sanitized
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/');
  
  return sanitized;
}
