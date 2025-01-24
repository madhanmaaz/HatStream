// AES Encryption/Decryption Utility
const ENCRYPTOR = {
    passwordToKey(password) {
        return password.padEnd(32, 'x').slice(0, 32)
    },
    encrypt(data, password) {
        const iv = CryptoJS.lib.WordArray.random(16)
        const key = CryptoJS.enc.Utf8.parse(this.passwordToKey(password))
        const encrypted = CryptoJS.AES.encrypt(data, key, { iv: iv })

        return `${iv.toString(CryptoJS.enc.Base64)}:${encrypted.toString()}`
    },
    decrypt(data, password) {
        const parts = data.split(":")
        const iv = CryptoJS.enc.Base64.parse(parts[0])
        const encrypted = parts[1]
        const key = CryptoJS.enc.Utf8.parse(this.passwordToKey(password))

        const decrypted = CryptoJS.AES.decrypt(encrypted, key, { iv: iv })
        return decrypted.toString(CryptoJS.enc.Utf8)
    }
}