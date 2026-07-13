const crypto = require("crypto");
function enc(key) {
  return crypto.createCipher("aes192", key);
}
module.exports = enc;
