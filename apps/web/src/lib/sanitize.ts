/**
 * Client-side input sanitization utilities.
 * These provide basic sanitization and validation before sending data to the server.
 * Note: Server-side validation is still required as the primary security layer.
 */

import type { ChangeEvent } from 'react';

/**
 * Sanitize general text input.
 * Removes control characters, null bytes, and trims whitespace.
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
  
  return sanitized;
}

/**
 * Sanitize a slug (URL-friendly identifier).
 * Converts to lowercase and keeps only alphanumeric characters and hyphens.
 */
export function sanitizeSlug(input: string): string {
  if (typeof input !== 'string') {
    return '';
  }

  let sanitized = input.toLowerCase().trim();
  
  // Remove control characters
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
 * Allows spaces and common characters but removes dangerous content.
 */
export function sanitizeDisplayName(input: string): string {
  if (typeof input !== 'string') {
    return '';
  }

  // Remove null bytes
  let sanitized = input.replace(/\0/g, '');
  
  // Normalize unicode
  sanitized = sanitized.normalize('NFC');
  
  // Remove control characters
  sanitized = sanitized.replace(/[\x00-\x1F\x7F]/g, '');
  
  // Trim and normalize whitespace
  sanitized = sanitized.trim().replace(/\s+/g, ' ');
  
  // Remove potentially dangerous HTML/script tags
  sanitized = sanitized.replace(/<script[^>]*>.*?<\/script>/gi, '');
  sanitized = sanitized.replace(/<[^>]+>/g, '');
  
  return sanitized;
}

/**
 * Sanitize message text (comments, descriptions).
 * Allows newlines but removes dangerous content.
 */
export function sanitizeMessage(input: string): string {
  if (typeof input !== 'string') {
    return '';
  }

  // Remove null bytes
  let sanitized = input.replace(/\0/g, '');
  
  // Normalize unicode
  sanitized = sanitized.normalize('NFC');
  
  // Remove dangerous control characters but keep newlines
  sanitized = sanitized.replace(/[\x00-\x09\x0B\x0C\x0E-\x1F\x7F]/g, '');
  
  // Normalize line breaks
  sanitized = sanitized.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  
  // Limit consecutive newlines
  sanitized = sanitized.replace(/\n{3,}/g, '\n\n');
  
  // Trim
  sanitized = sanitized.trim();
  
  // Remove HTML tags
  sanitized = sanitized.replace(/<script[^>]*>.*?<\/script>/gi, '');
  sanitized = sanitized.replace(/<[^>]+>/g, '');
  
  return sanitized;
}

/**
 * Validate that input doesn't contain suspicious patterns.
 * Returns true if input appears safe.
 */
export function validateInput(input: string): boolean {
  if (typeof input !== 'string') {
    return false;
  }

  // Check for common attack patterns
  const dangerousPatterns = [
    /<script/i,              // Script tags
    /javascript:/i,          // JavaScript protocol
    /on\w+\s*=/i,           // Event handlers
    /data:text\/html/i,     // Data URIs
    /vbscript:/i,           // VBScript protocol
    /<iframe/i,             // iframes
    /<object/i,             // Objects
    /<embed/i,              // Embeds
  ];

  return !dangerousPatterns.some(pattern => pattern.test(input));
}

/**
 * Sanitize input on change events.
 * Use this for real-time sanitization as users type.
 */
export function createSanitizedChangeHandler(
  sanitizeFunc: (value: string) => string,
  onChange: (value: string) => void
) {
  return (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const sanitized = sanitizeFunc(event.target.value);
    onChange(sanitized);
  };
}

/**
 * Sanitize input on blur events (when user leaves field).
 * Use this for sanitization that might be disruptive during typing.
 */
export function createSanitizedBlurHandler(
  sanitizeFunc: (value: string) => string,
  setValue: (value: string) => void,
  currentValue: string
) {
  return () => {
    const sanitized = sanitizeFunc(currentValue);
    if (sanitized !== currentValue) {
      setValue(sanitized);
    }
  };
}

/**
 * HTML entity encode a string to prevent XSS.
 * Encodes: < > & " ' /
 */
export function encodeHtml(input: string): string {
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
 * Decode HTML entities.
 * Decodes common entities back to their characters.
 */
export function decodeHtml(input: string): string {
  const entityMap: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#x27;': "'",
    '&#x2F;': '/',
  };
  
  return input.replace(/&[^;]+;/g, (entity) => entityMap[entity] || entity);
}
