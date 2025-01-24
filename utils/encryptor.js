const crypto = require("crypto")

function passwordToKey(password) {
    return password.padEnd(32, 'x').slice(0, 32)
}

function encrypt(data, password) {
    const keyBuffer = Buffer.from(passwordToKey(password), 'utf8')
    const ivBuffer = crypto.randomBytes(16)

    const cipher = crypto.createCipheriv('aes-256-cbc', keyBuffer, ivBuffer)
    let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'base64')
    encrypted += cipher.final('base64')
    return `${ivBuffer.toString("base64")}:${encrypted}`
}

function decrypt(data, password) {
    const parts = data.split(":")
    const keyBuffer = Buffer.from(passwordToKey(password), 'utf8')
    const ivBuffer = Buffer.from(parts[0], "base64")

    const decipher = crypto.createDecipheriv('aes-256-cbc', keyBuffer, ivBuffer)
    let decrypted = decipher.update(parts[1], 'base64', 'utf8')
    decrypted += decipher.final('utf8')
    return JSON.parse(decrypted)
}

module.exports = {
    encrypt,
    decrypt
}