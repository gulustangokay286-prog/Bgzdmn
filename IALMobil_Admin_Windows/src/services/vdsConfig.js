/**
 * Central VDS Configuration
 * Automatically detects if the app is served from VDS itself (same origin)
 * and uses relative URLs to avoid mixed-content issues.
 */

const VDS_IP = '213.142.159.36';
const VDS_PORT = '8080';
const VDS_FULL_URL = `http://${VDS_IP}:${VDS_PORT}`;

function getVdsBaseUrl() {
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    // Localhost'da test ederken doğrudan VDS'e (HTTP) gitsin
    if (host === 'localhost' || host === '127.0.0.1') {
      return VDS_FULL_URL;
    }
    // VDS'in kendisinden veya Vercel gibi bir yerden (HTTPS) sunuluyorsa,
    // relative URL ('') kullansın. Vercel rewrites veya VDS Express 
    // bunu arka planda doğru yere yönlendirecektir (Mixed Content önlenir).
    return '';
  }
  // Sunucu tarafında (SSR) veya bilinmeyen durumda tam URL
  return VDS_FULL_URL;
}

export const VDS_BASE_URL = getVdsBaseUrl();
export const VDS_SOCKET_URL = (typeof window !== 'undefined' &&
  window.location.hostname !== 'localhost' &&
  window.location.hostname !== '127.0.0.1')
  ? undefined   // socket.io connects to same origin when undefined
  : VDS_FULL_URL;

export default VDS_BASE_URL;
