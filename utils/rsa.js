const crypto = require("crypto")
const { rsaObject } = require("./database")

if (rsaObject.get("publicKey") == null || rsaObject.get("privateKey")) {
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

    rsaObject.set("publicKey", publicKey)
    rsaObject.set("privateKey", privateKey)
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
    decrypt
}