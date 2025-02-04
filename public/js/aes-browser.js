const AES = {
    passwordToKey(password) {
        const hash = CryptoJS.SHA256(password)
        return hash.toString(CryptoJS.enc.Hex).slice(0, 32)
    },
    encrypt(data, password) {
        const iv = CryptoJS.lib.WordArray.random(16)
        const key = CryptoJS.enc.Utf8.parse(this.passwordToKey(password))
        const compressedData = pako.deflate(JSON.stringify(data), { to: 'uint8array' })
        const encrypted = CryptoJS.AES.encrypt(CryptoJS.lib.WordArray.create(compressedData), key, { iv: iv })

        const ivArray = new Uint8Array(iv.words.map(word => [(word >> 24) & 0xff, (word >> 16) & 0xff, (word >> 8) & 0xff, word & 0xff]).flat())
        const encryptedArray = new Uint8Array(encrypted.ciphertext.words.map(word => [(word >> 24) & 0xff, (word >> 16) & 0xff, (word >> 8) & 0xff, word & 0xff]).flat())

        const combined = new Uint8Array(ivArray.length + encryptedArray.length)
        combined.set(ivArray, 0)
        combined.set(encryptedArray, ivArray.length)
        return combined
    },
    decrypt(encryptedBinary, password) {
        const iv = CryptoJS.lib.WordArray.create(encryptedBinary.slice(0, 16))
        const encrypted = CryptoJS.lib.WordArray.create(encryptedBinary.slice(16))
        const key = CryptoJS.enc.Utf8.parse(this.passwordToKey(password))

        const decrypted = CryptoJS.AES.decrypt({ ciphertext: encrypted }, key, { iv: iv })
        const decryptedBytes = new Uint8Array(decrypted.sigBytes);

        for (let i = 0; i < decrypted.sigBytes; i++) {
            decryptedBytes[i] = (decrypted.words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
        }

        return JSON.parse(pako.inflate(decryptedBytes, { to: 'string' }))
    }
}