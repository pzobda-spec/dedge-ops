const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="6" fill="#0f172a"/>
  <path d="M8 9h8.5c4.3 0 7.5 3 7.5 7s-3.2 7-7.5 7H8V9zm4 3.4v7.2h4.2c2.2 0 3.8-1.5 3.8-3.6s-1.6-3.6-3.8-3.6H12z" fill="#fff"/>
</svg>`

export function GET() {
  return new Response(favicon, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  })
}
