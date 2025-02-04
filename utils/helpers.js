const AES = require("./aes")
const credentials = require("./credentials")
const rateLimit = require("express-rate-limit")


module.exports = {
    CLIENTS: {},
    sendSecureSocket(action, obj) {
        try {
            obj.action = action
            IO.emit("data", {
                data: AES.encrypt(obj, credentials.PHRASE_1)
            })
        } catch (error) {
            IO.emit("data", {
                error: `[${action}] ${error.message}`
            })
        }
    },
    generateRansomString(length = 10) {
        const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
        let ransomString = "";

        for (let i = 0; i < length; i++) {
            const randomChar = characters.charAt(Math.floor(Math.random() * characters.length))
            ransomString += Math.random() > 0.5 ? randomChar.toUpperCase() : randomChar.toLowerCase()
        }

        return ransomString
    },
    messageLimiter: rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 100,
        message: "Too many requests.",
    }),
    escapeHTML(str) {
        if (str == null) return ""
        const escapeChars = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;',
        }

        return String(str).replace(/[&<>"']/g, char => escapeChars[char])
    }
}