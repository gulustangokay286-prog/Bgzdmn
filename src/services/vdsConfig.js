/**
 * Central VDS Configuration
 * Automatically detects if the app is served from VDS itself or HTTPS (Vercel)
 * and uses relative URLs to avoid mixed-content issues.
 * For Electron, Localhost, and LAN IPs, it connects directly to the VDS HTTP port.
 */

const VDS_IP = '213.142.159.36';
const VDS_PORT = '8080';
const VDS_FULL_URL = `http://${VDS_IP}:${VDS_PORT}`;

function getVdsBaseUrl() {
  if (typeof window !== 'undefined') {
    const protocol = window.location.protocol;
    const host = window.location.hostname;

    // Web üzerinde HTTPS ile barındırılıyorsa (Vercel, özel domain vs.)
    // Mixed Content engeline takılmamak için relative URL ('') kullanır (Vercel proxy rewrites devralır)
    if (protocol === 'https:') {
      return '';
    }

    // Doğrudan VDS IP'si üzerinden port 8080'de açılmışsa relative URL de geçerlidir
    if (host === VDS_IP) {
      return '';
    }

    // Localhost, Electron (file:// veya localhost), yerel ağ IP'leri (192.168.x.x, 10.x.x.x)
    // her zaman doğrudan VDS sunucusuna gitsin
    return VDS_FULL_URL;
  }
  return VDS_FULL_URL;
}

export const VDS_BASE_URL = getVdsBaseUrl();
export const VDS_SOCKET_URL = (typeof window !== 'undefined' && window.location.protocol === 'https:')
  ? undefined   // socket.io connects to same origin when undefined
  : VDS_FULL_URL;

export default VDS_BASE_URL;
