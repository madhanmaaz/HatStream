const OctaviaDB = require("octavia-db")
const credentials = require("./credentials")

const db = new OctaviaDB({
    database: "ssd",
    password: credentials.PHRASE_1,
    autoCommitInterval: 2000
})

const usersCollection = db.collection("users")
const messageCollection = db.collection("messages")
const rsaObject = db.dataObject("rsa")

module.exports = {
    db,
    usersCollection,
    messageCollection,
    rsaObject
}