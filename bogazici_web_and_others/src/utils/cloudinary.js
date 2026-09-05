/**
 * Cloudinary Client Utility for Boğaziçi Web & Others
 * Cloud Name: dbfhcj6px
 * Preset: ml_default
 */

export const CLOUDINARY_CONFIG = {
  cloudName: "dbfhcj6px",
  uploadPreset: "ml_default",
  folder: "bgz-mobil",
  uploadUrl: "https://api.cloudinary.com/v1_1/dbfhcj6px/auto/upload",
  imageUploadUrl: "https://api.cloudinary.com/v1_1/dbfhcj6px/image/upload",
  rawUploadUrl: "https://api.cloudinary.com/v1_1/dbfhcj6px/raw/upload"
};

/**
 * Upload a File (Image, PDF, Document, Video) to Cloudinary
 * @param {File|Blob} file 
 * @param {string} [folder] 
 * @param {function} [onProgress]
 * @returns {Promise<{ secure_url: string, public_id: string, format: string, bytes: number, original_filename: string }>}
 */
export async function uploadToCloudinary(file, folder = "bogazici-uploads", onProgress = null) {
  if (!file) {
    throw new Error("Lütfen yüklenecek bir dosya seçiniz.");
  }

  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", CLOUDINARY_CONFIG.uploadPreset);
  formData.append("folder", folder);

  const xhr = new XMLHttpRequest();

  return new Promise((resolve, reject) => {
    if (onProgress && xhr.upload) {
      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable) {
          const percent = Math.round((e.loaded / e.total) * 100);
          onProgress(percent);
        }
      });
    }

    xhr.open("POST", CLOUDINARY_CONFIG.uploadUrl, true);

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const res = JSON.parse(xhr.responseText);
          resolve({
            secure_url: res.secure_url,
            public_id: res.public_id,
            format: res.format,
            bytes: res.bytes,
            width: res.width,
            height: res.height,
            resource_type: res.resource_type,
            original_filename: res.original_filename || file.name
          });
        } catch (e) {
          reject(new Error("Cloudinary yanıtı çözümlenemedi."));
        }
      } else {
        try {
          const errRes = JSON.parse(xhr.responseText);
          reject(new Error(errRes.error?.message || `Yükleme başarısız (${xhr.status})`));
        } catch (e) {
          reject(new Error(`Yükleme başarısız (${xhr.status})`));
        }
      }
    };

    xhr.onerror = () => reject(new Error("Ağ bağlantısı hatası oluştu."));
    xhr.send(formData);
  });
}

/**
 * Generates an auto-optimized Cloudinary delivery URL
 * @param {string} url 
 * @param {object} options 
 * @returns {string}
 */
export function getOptimizedImageUrl(url, { width = 800, height = null, crop = "fill", quality = "auto" } = {}) {
  if (!url || !url.includes("cloudinary.com")) return url;
  
  let transformations = `f_auto,q_${quality}`;
  if (width) transformations += `,w_${width}`;
  if (height) transformations += `,h_${height},c_${crop}`;

  return url.replace("/upload/", `/upload/${transformations}/`);
}

/**
 * Returns face-centered avatar URL
 * @param {string} url 
 * @param {number} size 
 * @returns {string}
 */
export function getAvatarThumbnailUrl(url, size = 160) {
  if (!url || !url.includes("cloudinary.com")) return url;
  return url.replace("/upload/", `/upload/c_thumb,g_face,w_${size},h_${size},f_auto,q_auto/`);
}