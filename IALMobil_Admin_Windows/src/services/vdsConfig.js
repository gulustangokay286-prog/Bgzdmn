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
    const port = window.location.port;
    // If served from VDS itself, use relative URL (empty string)
    if (host === VDS_IP && port === VDS_PORT) {
      return '';
    }
    // If running on localhost (dev server), use full VDS URL
    if (host === 'localhost' || host === '127.0.0.1') {
      return VDS_FULL_URL;
    }
  }
  // Default: full URL
  return VDS_FULL_URL;
}

export const VDS_BASE_URL = getVdsBaseUrl();
export const VDS_SOCKET_URL = (typeof window !== 'undefined' &&
  window.location.hostname === VDS_IP &&
  window.location.port === VDS_PORT)
  ? undefined   // socket.io connects to same origin when undefined
  : VDS_FULL_URL;

export default VDS_BASE_URL;
