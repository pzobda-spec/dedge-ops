/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      {
        source: '/onboarding/charge',
        destination: '/onboarding/pilotage',
        permanent: true,
      },
    ]
  },
}

export default nextConfig;
