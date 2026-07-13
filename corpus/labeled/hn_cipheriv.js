const crypto = require("crypto");
function enc(key, iv) {
  return crypto.createCipheriv("aes-256-gcm", key, iv);
}
module.exports = enc;
