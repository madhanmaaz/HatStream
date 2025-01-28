const crypto = require("crypto")
const { rsaCollection } = require("./database")

let KEYS = rsaCollection.find({ key: "RSA" })
if (!KEYS) {
    const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
        modulusLength: 2048,
        publicKeyEncoding: {
            type: "spki",
            format: "pem",
        },
        privateKeyEncoding: {
            type: "pkcs8",
            format: "pem",
        },
    })

    KEYS = { key: "RSA", pubKey: publicKey, priKey: privateKey }
    rsaCollection.insert(KEYS)
}

function encrypt(data, publicKey) {
    return crypto.publicEncrypt(
        {
            key: publicKey,
            padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
            oaepHash: "sha256",
        },
        Buffer.from(JSON.stringify(data))
    ).toString("base64")
}

function decrypt(data, privateKey) {
    return JSON.parse(crypto.privateDecrypt(
        {
            key: privateKey,
            padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
            oaepHash: "sha256",
        },
        Buffer.from(data, "base64")
    ))
}

module.exports = {
    encrypt,
    decrypt,
    KEYS
}