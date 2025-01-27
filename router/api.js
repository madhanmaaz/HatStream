const express = require("express")
const axios = require("axios")
const nodeURL = require("url")

const { usersCollection, messageCollection, rsaCollection } = require("../utils/database")
const credentials = require("../utils/credentials")
const ENCRYPTOR = require("../utils/encryptor")
const helpers = require("../utils/helpers")
const RSA = require("../utils/rsa")

const router = express.Router()

router.post("/client", async (req, res) => {
    const body = req.body

    if (body.data == null) {
        return res.json({ $error: "Invalid params." })
    }

    try {
        const decrypted = ENCRYPTOR.decrypt(body.data, credentials.PHRASE_2)
        if (decrypted.length === 0) {
            return res.json({ $error: "Incorrect phrase values." })
        }

        const clientData = await handleActions(decrypted) || {}
        const encrypted = ENCRYPTOR.encrypt(clientData, credentials.PHRASE_1)
        res.json({ data: encrypted })
    } catch (error) {
        console.log(error)
        return res.json({ $error: "Incorrect phrase values." })
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

    if (!userAddress || !thisUserAddress) {
        return { $error: "Invalid user data." }
    }

    switch (action) {
        case "USER_STATUS": {
            try {
                const user = usersCollection.find({ userAddress })
                if (user && user.blocked) {
                    return { $error: "User blocked by you." }
                }

                const response = await axios.post(`${userAddress}/api/s2s`, {
                    action: "USER_STATUS",
                    thisUserAddress
                }, {
                    headers: {
                        "Content-Type": "application/json"
                    }
                })

                if (response.headers.get("chatapp") !== "HATSTREAM") {
                    return { $error: "This is not a valid Hatstream server." }
                }

                return response.data
            } catch (error) {
                console.log(error)
                return { $error: `Failed to check status.  Maybe this is not a valid Hatstream server. ${error.message}` }
            }
        }

        case "ADD_USER": {
            try {
                const user = usersCollection.find({ userAddress })
                if (user) {
                    return { $error: "User already exists." }
                }

                const response = await axios.post(`${userAddress}/api/s2s`, {
                    action: "ADD_USER",
                    thisUserAddress,
                    pubKey: rsaCollection.find({ key: "RSA" }).pubKey // our key
                }, {
                    headers: {
                        "Content-Type": "application/json"
                    }
                })

                if (response.data.hasOwnProperty("$error")) {
                    return response.data
                }

                usersCollection.insert({
                    userAddress,
                    pubKey: response.data.pubKey // remote key
                })

                delete response.data.pubKey
                return response.data
            } catch (error) {
                console.log(error)
                return { $error: `Failed to add user. Maybe this is not a valid Hatstream server. ${error.message}` }
            }
        }

        case "BLOCK_USER": {
            try {
                const user = usersCollection.find({ userAddress })
                if (!user) return { $error: "User not found in your server." }

                usersCollection.update({ userAddress }, { blocked: !user.blocked })
                return {
                    data: !user.blocked ? "User blocked." : "User unblocked."
                }
            } catch (error) {
                console.log(error)
                return { $error: `Failed to block user. ${error.message}` }
            }
        }

        case "CLEAR_MESSAGES": {
            try {
                messageCollection.removeMany({ userAddress })
                return { data: "Messages cleared." }
            } catch (error) {
                console.log(error)
                return { $error: `Failed to clear messages. ${error.message}` }
            }
        }

        case "DOWNLOAD_MESSAGES": {
            try {
                const messages = messageCollection.findMany({ userAddress })
                if (!messages) return { $error: "User not found in your server." }

                return { data: messages }
            } catch (error) {
                console.log(error)
                return { $error: `Failed to download messages. ${error.message}` }
            }
        }

        case "MESSAGE_TO_REMOTE": {
            let status
            const messageObj = {
                type: options.type,
                time: options.time,
                data: options.data,
                filename: options.filename,
                ftype: options.ftype
            }

            try {
                const user = usersCollection.find({ userAddress })
                if (!user) {
                    return { $error: "User not found in your server." }
                }

                if (user.blocked) {
                    return { $error: "Blocked by you." }
                }

                const response = await axios.post(`${userAddress}/api/s2s`, {
                    action: "RECEIVE_MESSAGE",
                    data: RSA.encrypt(messageObj, user.pubKey /* remote key */),
                    thisUserAddress
                }, {
                    headers: {
                        "Content-Type": "application/json"
                    }
                })

                status = response.data
            } catch (error) {
                console.log(error)
                return { $error: `Failed to send message. ${error.code || error.message}` }
            }

            try {
                messageCollection.insert({
                    userAddress,
                    ...messageObj
                })

                return status
            } catch (error) {
                console.log(error)
                return { $error: `Failed to send message. ${error.message}` }
            }
        }

        default:
            return { $error: "Invalid action." }
    }
}

router.route("/s2s").post(helpers.messageLimiter, (req, res) => {
    try {
        res.setHeader("chatapp", "HATSTREAM")
        res.json(handleS2S(req.body) || {})
    } catch (error) {
        console.log(error)
        res.json({ $error: `Failed to communicate to remote server.` })
    }
})

function handleS2S(options) {
    const { action, thisUserAddress } = options

    if (!thisUserAddress) {
        return { $error: "from user address not found." }
    }

    switch (action) {
        case "USER_STATUS": {
            try {
                const user = usersCollection.find({ userAddress: thisUserAddress })
                let status = { data: "Good to add user." }

                if (user) {
                    if (user.blocked) {
                        status = { $error: "Blocked by remote user." }
                    } else {
                        status = {
                            data: Object.keys(helpers.CLIENTS).length === 0
                                ? "User offline" : "User online"
                        }
                    }
                }

                return status
            } catch (error) {
                console.log(error)
                return { $error: "Failed to retrieve status. Please try again later." }
            }
        }

        case "ADD_USER": {
            let userAddress
            try {
                const parsedURL = new nodeURL.URL(thisUserAddress)
                userAddress = parsedURL.origin
            } catch (error) {
                console.log(error)
                return { $error: "Invalid URL." }
            }

            if (!userAddress) {
                return { $error: "Invalid URL." }
            }

            if (!options.pubKey) {
                return { $error: "Invalid params." }
            }

            try {
                usersCollection.insert({
                    userAddress,
                    pubKey: options.pubKey // remote key
                })

                helpers.sendSecureSocket("ADD_USER", { userAddress })
                return {
                    data: "User added successfully.",
                    pubKey: rsaCollection.find({ key: "RSA" }).pubKey // our key
                }
            } catch (error) {
                console.log(error)
                return { $error: "Faliled to add user." }
            }
        }

        case "RECEIVE_MESSAGE": {
            try {
                const user = usersCollection.find({ userAddress: thisUserAddress })
                if (!user) {
                    return { $error: "User not found." }
                }

                if (user.blocked) {
                    return { $error: "Blocked by remote user." }
                }

                const { type, time, data, filename, ftype } = RSA.decrypt(
                    options.data,
                    rsaCollection.find({ key: "RSA" }).priKey /* our key */
                )

                const messageObj = {
                    userAddress: thisUserAddress,
                    type,
                    time,
                    data,
                    filename,
                    ftype,
                    remote: true
                }

                messageCollection.insert(messageObj)
                helpers.sendSecureSocket("MESSAGE", messageObj)
                return { data: "OK" }
            } catch (error) {
                console.log(error)
                return { $error: `Failed to send message. ${error.message}` }
            }
        }

        default:
            return { $error: "Invalid action." }
    }
}

module.exports = router