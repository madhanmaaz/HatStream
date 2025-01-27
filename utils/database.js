const { OctaviaDB } = require("octavia-db")
const credentials = require("./credentials")
const path = require("path")

const db = new OctaviaDB({
    database: path.join(process.__dirname, "ssd"),
    database: "ssd",
    password: credentials.PHRASE_1
})

const usersCollection = db.Collection("users")
const messageCollection = db.Collection("messages")
const rsaCollection = db.Collection("rsa_key")

module.exports = {
    db,
    usersCollection,
    messageCollection,
    rsaCollection
}