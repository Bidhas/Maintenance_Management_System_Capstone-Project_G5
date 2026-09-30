const bcrypt = require('bcrypt');
 
const SALT_ROUNDS = 10;
 
// Hash a plain password before saving it (US-01-T2)
const hashPassword = (plain) => bcrypt.hash(plain, SALT_ROUNDS);
 
// Compare a plain password with a stored hash (will be used by login, US-02)
const comparePassword = (plain, hash) => bcrypt.compare(plain, hash);
 
module.exports = { hashPassword, comparePassword };