// Web Crypto API implementation of AES-256-CBC envelope
export const cryptoService = {
  // Must exactly match the backend key
  keyString: 'BoGaziCi_Koleji_AES_256_Key_2026',

  async getKey() {
    const enc = new TextEncoder();
    const keyMaterial = enc.encode(this.keyString);
    return await crypto.subtle.importKey(
      'raw',
      keyMaterial,
      { name: 'AES-CBC' },
      false,
      ['encrypt']
    );
  },

  async encryptToken(token) {
    return this.encryptPayload(token);
  },

  async encryptPayload(data) {
    try {
      const payloadString = typeof data === 'string' ? data : JSON.stringify(data);
      const enc = new TextEncoder();
      const iv = crypto.getRandomValues(new Uint8Array(16));
      const key = await this.getKey();
      
      const encryptedBuffer = await crypto.subtle.encrypt(
        { name: 'AES-CBC', iv: iv },
        key,
        enc.encode(payloadString)
      );

      const combined = new Uint8Array(iv.length + encryptedBuffer.byteLength);
      combined.set(iv, 0);
      combined.set(new Uint8Array(encryptedBuffer), iv.length);

      let binary = '';
      for (let i = 0; i < combined.byteLength; i++) {
        binary += String.fromCharCode(combined[i]);
      }
      return btoa(binary);
    } catch (e) {
      console.error('Encryption failed:', e);
      return typeof data === 'string' ? data : JSON.stringify(data);
    }
  },

  async decryptPayload(base64String) {
    try {
      const binaryString = atob(base64String);
      const combined = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        combined[i] = binaryString.charCodeAt(i);
      }
      
      const iv = combined.slice(0, 16);
      const encryptedData = combined.slice(16);
      const key = await this.getKey();

      const decryptedBuffer = await crypto.subtle.decrypt(
        { name: 'AES-CBC', iv: iv },
        key,
        encryptedData
      );

      const dec = new TextDecoder();
      const jsonString = dec.decode(decryptedBuffer);
      return JSON.parse(jsonString);
    } catch (e) {
      console.error('Decryption failed, returning raw string:', e);
      try { return JSON.parse(base64String); } catch { return base64String; }
    }
  }
};
