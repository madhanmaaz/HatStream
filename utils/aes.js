const crypto = require("crypto")
const zlib = require("zlib")

function passwordToKey(password) {
    const key = crypto.createHash("sha256")
        .update(password)
        .digest("hex")
        .slice(0, 32)

    return Buffer.from(key, "utf-8")
}

function encrypt(data, password) {
    const compressedData = zlib.deflateSync(JSON.stringify(data))
    const keyBuffer = passwordToKey(password)
    const ivBuffer = crypto.randomBytes(16)

    const cipher = crypto.createCipheriv('aes-256-cbc', keyBuffer, ivBuffer)
    const encrypted = Buffer.concat([
        cipher.update(compressedData),
        cipher.final()
    ])

    return Buffer.concat([
        ivBuffer,
        encrypted
    ])
}

function decrypt(data, password) {
    const keyBuffer = passwordToKey(password)
    const ivBuffer = data.slice(0, 16)

    const decipher = crypto.createDecipheriv('aes-256-cbc', keyBuffer, ivBuffer)
    const decrypted = Buffer.concat([
        decipher.update(data.slice(16)),
        decipher.final()
    ])

    return JSON.parse(zlib.inflateSync(decrypted))
}

module.exports = {
    encrypt,
    decrypt
}