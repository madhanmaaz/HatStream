const crypto = require("crypto")
const { rsaCollection } = require("./database")

// Generate RSA key pair
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
});

if (!rsaCollection.find({ key: "RSA" })) {
    rsaCollection.insert({ key: "RSA", pubKey: publicKey, priKey: privateKey })
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