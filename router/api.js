const express = require("express")
const axios = require("axios")
const nodeURL = require("url")
const FormData = require('form-data')

const { usersCollection, rsaObject, messageCollection } = require("../utils/database")
const credentials = require("../utils/credentials")
const helpers = require("../utils/helpers")
const AES = require("../utils/aes")
const RSA = require("../utils/rsa")

const router = express.Router()

router.post("/client", async (req, res) => {
    try {
        if (!req.files || !req.files.enc) return res.sendStatus(401)

        const decrypted = AES.decrypt(req.files.enc.data, credentials.PHRASE_2)
        const clientData = await handleActions(decrypted) || {}
        const encrypted = AES.encrypt(clientData, credentials.PHRASE_1)

        res.setHeader("Content-Type", "application/octet-stream")
        res.send(encrypted)
    } catch (error) {
        console.log(error)
        return res.sendStatus(401)
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
        return { error: "Invalid client data." }
    }

    switch (action) {
        case "USER_STATUS": {
            try {
                const user = usersCollection.find({ userAddress })
                if (user && user.blocked) {
                    return { error: "User blocked by you." }
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
                    return { error: "This is not a valid Hatstream server." }
                }

                return response.data
            } catch (error) {
                return { error: `Failed to check status. Maybe this is not a valid Hatstream server. ${error.message}` }
            }
        }

        case "ADD_USER": {
            try {
                const user = usersCollection.find({ userAddress })
                if (user) {
                    return { error: "User already exists." }
                }

                const response = await axios.post(`${userAddress}/api/s2s`, {
                    action: "ADD_USER",
                    thisUserAddress,
                    publicKey: rsaObject.get("publicKey") // our key
                }, {
                    headers: {
                        "Content-Type": "application/json"
                    }
                })

                if (response.data.hasOwnProperty("error")) {
                    return response.data
                }

                if (!response.data.token) return {
                    error: "Invalid token from remote server."
                }

                const token = RSA.decrypt(response.data.token, rsaObject.get("privateKey"))
                usersCollection.insert({
                    userAddress,
                    token
                })

                delete response.data.token
                return response.data
            } catch (error) {
                console.log(error)
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
                console.log(error)
                return { error: `Failed to block user. ${error.message}` }
            }
        }

        case "CLEAR_MESSAGES": {
            try {
                messageCollection.removeMany({ userAddress })
                return { data: "Messages cleared." }
            } catch (error) {
                console.log(error)
                return { error: `Failed to clear messages. ${error.message}` }
            }
        }

        case "DOWNLOAD_MESSAGES": {
            try {
                const messages = messageCollection.findMany({ userAddress })
                if (!messages) return { error: "User not found in your server." }

                return { data: messages }
            } catch (error) {
                console.log(error)
                return { error: `Failed to download messages. ${error.message}` }
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
                    return { error: "User not found in your server." }
                }

                if (user.blocked) {
                    return { error: "Blocked by you." }
                }

                const formData = new FormData()
                formData.append("thisUserAddress", thisUserAddress)
                formData.append(
                    "enc",
                    AES.encrypt(messageObj, user.token),
                    "enc.bin"
                )

                const response = await axios.post(`${userAddress}/api/s2s/message`, formData, {
                    headers: {
                        ...formData.getHeaders()
                    }
                })

                if (response.data.hasOwnProperty("error")) {
                    return response.data
                }

                status = response.data
            } catch (error) {
                console.log(error)
                return { error: `Failed to send message. ${error.code || error.message}` }
            }

            try {
                messageCollection.insert({
                    userAddress,
                    ...messageObj
                })

                return status
            } catch (error) {
                console.log(error)
                return { error: `Failed to send message. ${error.message}` }
            }
        }

        default:
            return { error: "Invalid action." }
    }
}

router.post("/s2s", helpers.messageLimiter, (req, res) => {
    try {
        res.setHeader("chatapp", "HATSTREAM")
        res.json(handleS2S(req.body) || {})
    } catch (error) {
        console.log(error)
        res.json({ error: `Failed to communicate to remote server.` })
    }
})

function handleS2S(options) {
    const { action, thisUserAddress } = options
    if (!thisUserAddress) {
        return { error: "from user address not found." }
    }

    switch (action) {
        case "USER_STATUS": {
            try {
                const user = usersCollection.find({ userAddress: thisUserAddress })
                let status = { data: "Good to add user." }
                if (user) {
                    if (user.blocked) {
                        status = { error: "Blocked by remote user." }
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
                return { error: "Failed to retrieve status. Please try again later." }
            }
        }

        case "ADD_USER": {
            let userAddress
            try {
                const parsedURL = new nodeURL.URL(thisUserAddress)
                userAddress = parsedURL.origin
            } catch (error) {
                console.log(error)
                return { error: "Invalid URL." }
            }

            if (!userAddress) {
                return { error: "Invalid URL." }
            }

            if (!options.publicKey) {
                return { error: "Invalid params." }
            }

            try {
                const newToken = helpers.generateRansomString(16)

                usersCollection.insert({
                    userAddress,
                    token: newToken
                })

                helpers.sendSecureSocket("ADD_USER", { userAddress })
                return {
                    data: "User added successfully.",
                    token: RSA.encrypt(newToken, options.publicKey)
                }
            } catch (error) {
                console.log(error)
                return { error: "Faliled to add user." }
            }
        }

        default:
            return { error: "Invalid action." }
    }
}

router.post("/s2s/message", helpers.messageLimiter, (req, res) => {
    try {
        if (!req.files || !req.files.enc || !req.body.thisUserAddress) {
            return res.sendStatus(401)
        }

        const thisUserAddress = req.body.thisUserAddress
        const user = usersCollection.find({ userAddress: thisUserAddress })
        if (!user) {
            return res.json({ error: "User not found in remote server." })
        }

        if (user.blocked) {
            return res.json({ error: "Blocked by remote user." })
        }

        const decrypted = AES.decrypt(req.files.enc.data, user.token)
        decrypted.userAddress = thisUserAddress
        decrypted.remote = true
        messageCollection.insert(decrypted)
        helpers.sendSecureSocket("MESSAGE", decrypted)

        return res.json({ data: "message received." })
    } catch (error) {
        console.log(error)
        res.json({ error: `Failed to communicate to remote server.` })
    }
})

module.exports = router