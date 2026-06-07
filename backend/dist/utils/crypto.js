"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.encrypt = encrypt;
exports.decrypt = decrypt;
const crypto_1 = __importDefault(require("crypto"));
const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16; // AES block size
// Ensure key is 32 characters
function getSecretKey() {
    const rawKey = process.env.ENCRYPTION_KEY || 'default_32_characters_secret_key_123';
    return crypto_1.default.createHash('sha256').update(rawKey).digest();
}
/**
 * Encrypt plain text using AES-256-CBC
 */
function encrypt(text) {
    try {
        const iv = crypto_1.default.randomBytes(IV_LENGTH);
        const cipher = crypto_1.default.createCipheriv(ALGORITHM, getSecretKey(), iv);
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return `${iv.toString('hex')}:${encrypted}`;
    }
    catch (err) {
        console.error('Encryption failed:', err);
        throw new Error('Failed to encrypt data');
    }
}
/**
 * Decrypt ciphertext using AES-256-CBC
 */
function decrypt(text) {
    try {
        const parts = text.split(':');
        if (parts.length !== 2) {
            // Fallback in case string is not encrypted (e.g. legacy data)
            return text;
        }
        const iv = Buffer.from(parts[0], 'hex');
        const encryptedText = Buffer.from(parts[1], 'hex');
        try {
            const decipher = crypto_1.default.createDecipheriv(ALGORITHM, getSecretKey(), iv);
            let decrypted = decipher.update(encryptedText);
            decrypted = Buffer.concat([decrypted, decipher.final()]);
            return decrypted.toString('utf8');
        }
        catch (activeKeyErr) {
            // Fallback: try with default key
            const fallbackKey = crypto_1.default.createHash('sha256').update('default_32_characters_secret_key_123').digest();
            const decipher = crypto_1.default.createDecipheriv(ALGORITHM, fallbackKey, iv);
            let decrypted = decipher.update(encryptedText);
            decrypted = Buffer.concat([decrypted, decipher.final()]);
            return decrypted.toString('utf8');
        }
    }
    catch (err) {
        console.error('Decryption failed. Returning original text:', err);
        return text; // Return text as fallback
    }
}
