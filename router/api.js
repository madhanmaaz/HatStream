const express = require("express")
const axios = require("axios")

const { usersCollection, messageCollection } = require("../utils/database")
const credentials = require("../utils/credentials")
const ENCRYPTOR = require("../utils/encryptor")
const helpers = require("../utils/helpers")

const router = express.Router()

router.post("/client", async (req, res) => {
    const body = req.body

    if (body.data == null) {
        return res.sendStatus(400)
    }

    try {
        const decrypted = ENCRYPTOR.decrypt(body.data, credentials.PHRASE_2)
        if (decrypted.length === 0) {
            return res.json({ error: "Phrase error." })
        }

        const clientData = await handleActions(decrypted) || {}
        const encrypted = ENCRYPTOR.encrypt(clientData, credentials.PHRASE_1)
        res.json({ data: encrypted })
    } catch (error) {
        return res.json({ error: "Phrase error." })
    }
})

async function handleActions(options) {
    const { action, userAddress, thisUserAddress } = options

    switch (action) {
        case "AUTH":
            return { data: "OK" }

        case "GET_USERS": {
            return { data: usersCollection.findMany({}) }
        }
    }

    if (!userAddress || !thisUserAddress) return {
        error: "Invalid user data."
    }

    switch (action) {
        case "USER_STATUS": {
            try {
                const user = usersCollection.find({ userAddress })
                if (user && user.blocked) {
                    return { error: "User blocked by you." }
                }

                const response = await axios.get(`${userAddress}/api/ping?thisUserAddress=${thisUserAddress}`)
                if (response.headers.get("chatapp") !== "HATSTREAM") {
                    return { error: "This is not a valid Hatstream server." }
                }

                return { data: response.data }
            } catch (error) {
                return { error: `Failed to check status.  Maybe this is not a valid Hatstream server. ${error.message}` }
            }
        }

        case "ADD_USER": {
            try {
                const user = usersCollection.find({ userAddress })
                if (user) {
                    return { error: "User already exists." }
                }

                const token = helpers.generateRansomString(32)
                const response = await axios.post(`${userAddress}/api/ping?thisUserAddress=${thisUserAddress}`, {
                    token
                }, {
                    headers: {
                        "Content-Type": "application/json"
                    }
                })

                if (response.data !== "OK") {
                    return { error: "Failed to add user." }
                }

                usersCollection.insert({ userAddress, token })
                return { data: "User added successfully." }
            } catch (error) {
                return { error: `Failed to add user. Maybe this is not a valid Hatstream server. ${error.message}` }
            }
        }

        case "BLOCK_USER": {
            try {
                const user = usersCollection.find({ userAddress })
                if (!user) return { error: "User not found in your server." }

                usersCollection.update({ userAddress }, { blocked: !user.blocked })
                return {
                    data: !user.blocked ? "User blocked." : "User unblocked."
                }
            } catch (error) {
                return { error: `Failed to block user. ${error.message}` }
            }
        }

        case "CLEAR_MESSAGES": {
            try {
                messageCollection.removeMany({ userAddress })
                return { data: "Messages cleared." }
            } catch (error) {
                return { error: `Failed to clear messages. ${error.message}` }
            }
        }

        case "DOWNLOAD_MESSAGES": {
            try {
                const messages = messageCollection.findMany({ userAddress })
                if (!messages) return "User not found in your server."

                return { data: messages }
            } catch (error) {
                return `Failed to download messages. ${error.message}`
            }
        }

        case "MESSAGE_TO_REMOTE": {
            let status
            const messageObj = {
                type: options.type,
                time: options.time,
                data: options.data,
                filename: options.filename
            }

            try {
                const user = usersCollection.find({ userAddress })
                if (!user) {
                    return "User not found in your server."
                }

                if (user.blocked) {
                    return "Blocked by you."
                }

                const response = await axios.post(`${userAddress}/api/message?thisUserAddress=${thisUserAddress}`, {
                    data: ENCRYPTOR.encrypt(messageObj, user.token)
                }, {
                    headers: {
                        "Content-Type": "application/json"
                    }
                })

                status = response.data
            } catch (error) {
                return `Failed to send message. ${error.code || error.message}`
            }

            try {
                messageCollection.insert({
                    userAddress,
                    ...messageObj,
                    status
                })

                return status
            } catch (error) {
                return `Failed to send message. ${error.message}`
            }
        }

        default:
            return { error: "Invalid action." }
    }
}

router.route("/ping").get((req, res) => {
    res.setHeader("chatapp", "HATSTREAM")

    try {
        const { thisUserAddress } = req.query
        if (!thisUserAddress) {
            return res.sendStatus(400)
        }

        const user = usersCollection.find({ userAddress: thisUserAddress })
        let status = "Good to add user."

        if (user) {
            if (user.blocked) {
                status = "Blocked by remote user."
            } else {
                status = Object.keys(helpers.CLIENTS).length === 0
                    ? "User offline" : "User online"
            }
        }

        res.send(status)
    } catch (error) {
        res.send("Failed to retrieve status. Please try again later.")
    }
}).post((req, res) => {
    try {
        const { thisUserAddress } = req.query
        const { token } = req.body

        if (!thisUserAddress) {
            return res.sendStatus(400)
        }

        const userAddress = helpers.escapeHTML(thisUserAddress)
        usersCollection.insert({
            userAddress,
            token
        })

        helpers.sendSecureSocket("ADD_USER", { userAddress })
        res.sendStatus(200)
    } catch (error) {
        res.sendStatus(401)
    }
})

router.route("/message").post(helpers.messageLimiter, (req, res) => {
    try {
        const { thisUserAddress } = req.query
        if (!thisUserAddress) {
            return res.sendStatus(400)
        }

        const user = usersCollection.find({ userAddress: thisUserAddress })
        if (!user) {
            return res.send("User not found.")
        }

        if (user.blocked) {
            return res.send("Blocked by remote user.")
        }

        const encrypted = req.body.data
        const { type, time, data, filename } = ENCRYPTOR.decrypt(encrypted, user.token)
        const messageObj = {
            userAddress: thisUserAddress,
            type,
            time,
            data,
            filename,
            remote: true
        }

        messageCollection.insert(messageObj)
        helpers.sendSecureSocket("MESSAGE", messageObj)
        res.sendStatus(200)
    } catch (error) {
        res.send("Failed to send message.")
    }
})

module.exports = router