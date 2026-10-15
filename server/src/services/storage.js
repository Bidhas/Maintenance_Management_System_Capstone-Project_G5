const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('../config');

const EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };

/**
 * Saves an uploaded image (multer memory file) and returns its URL.
 * Uses Cloudinary when configured (CLOUDINARY_URL), otherwise the local uploads/ folder.
 * Cloudinary failures fall back to local storage so a submission never fails because of it.
 */
async function saveImage(file) {
  if (!file) return null;
  if (config.cloudinaryConfigured) {
    try {
      const cloudinary = require('cloudinary').v2;
      const result = await new Promise((resolve, reject) => {
        cloudinary.uploader
          .upload_stream({ folder: 'cmms', resource_type: 'image' }, (err, res) => (err ? reject(err) : resolve(res)))
          .end(file.buffer);
      });
      return result.secure_url;
    } catch (err) {
      console.error('Cloudinary upload failed, using local storage:', err.message);
    }
  }
  fs.mkdirSync(config.uploadDir, { recursive: true });
  const name = crypto.randomBytes(12).toString('hex') + (EXT[file.mimetype] || '.jpg');
  fs.writeFileSync(path.join(config.uploadDir, name), file.buffer);
  return `/uploads/${name}`;
}

module.exports = { saveImage };
