// lib/zoho/htmlSanitizer.ts
// Pure string-based HTML sanitizer — safe to use both server-side and client-side
// Does NOT use DOMParser or any browser APIs

/**
 * Sanitizes HTML from Zoho email threads.
 * Removes dangerous elements and event handlers while preserving formatting.
 */
export function sanitizeEmailHtml(html: string): string {
  if (!html) return ''

  return html
    // Remove dangerous elements entirely (with their content)
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    // Remove event handlers (on*)
    .replace(/\s+on\w+="[^"]*"/gi, '')
    .replace(/\s+on\w+='[^']*'/gi, '')
    // Remove javascript: hrefs
    .replace(/href="javascript:[^"]*"/gi, 'href="#"')
    .replace(/href='javascript:[^']*'/gi, "href='#'")
}

/**
 * Strips ALL HTML tags and returns plain text.
 * Used as a fallback when no full HTML content is available.
 */
export function htmlToPlainText(html: string): string {
  if (!html) return ''

  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
