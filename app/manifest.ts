import { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Rotine Cards',
    short_name: 'Rotine',
    description: 'Tactical Time Management',
    start_url: '/',
    display: 'standalone',
    background_color: '#020203',
    theme_color: '#10b981',
    icons: [
      {
        src: '/icon.png',
        sizes: 'any',
        type: 'image/png',
      },
      {
        src: '/caraapp.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable'
      },
      {
        src: '/caraapp.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any'
      }
    ],
  }
}
