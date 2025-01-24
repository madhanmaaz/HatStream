console.log("HATSTREM - secure chatapp")
document.addEventListener("contextmenu", function (event) {
    event.preventDefault()
})

document.addEventListener("keydown", (e) => {
    const forbiddenKeys = ["F12", "I", "J", "U"]
    if (forbiddenKeys.includes(e.key) && (e.ctrlKey || e.shiftKey)) {
        e.preventDefault()
    }
})

const authForm = document.querySelector("#auth-form")
const rootApp = document.querySelector("#root")
const sidebarContainer = document.querySelector(".sidebar")
const mainContainer = rootApp.querySelector("main")
const settingsContainer = document.querySelector(".settings-container")
const userForm = document.querySelector("#user-form")
const userFormMessageBox = userForm.querySelector(".message")
const usersDatalist = document.querySelector("#users-datalist")
const usersContainer = document.querySelector("#users-container")
const messageContainer = document.querySelector(".message-container")
const fromUserText = document.querySelector("#from-user-text")
const toUserText = document.querySelector("#to-user-text")
const chatForm = document.querySelector("#chat-form")
const uploadFile = document.querySelector("#upload-file")

document.querySelector("#close-access").addEventListener("click", () => {
    location.reload()
})

document.querySelector("#open-sidebar").addEventListener("click", () => {
    sidebarContainer.classList.add("active")
    mainContainer.classList.remove("active")
})

document.querySelector("#close-sidebar").addEventListener("click", () => {
    sidebarContainer.classList.remove("active")
    mainContainer.classList.add("active")
})

document.querySelector("#open-settings").addEventListener("click", () => {
    settingsContainer.classList.add("active")
    rootApp.classList.remove("active")
})

document.querySelector("#close-settings").addEventListener("click", () => {
    settingsContainer.classList.remove("active")
    rootApp.classList.add("active")
})

fromUserText.innerText = location.origin

const STATE = {
    PHRASE_1: null,
    PHRASE_2: null,
    reset() {
        this.PHRASE_1 = null
        this.PHRASE_2 = null
    },
    isAuthenticated() {
        return this.PHRASE_1 && this.PHRASE_2
    }
}

const fileMaxSize = 10 * 1024 * 1024
const APP_DATA = {
    users: {},
    messages: {},
    currentUser: null,
    atBottom: null
}

function escapeHTML(str) {
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

function getCurrentTime() {
    const now = new Date()

    const hours = String(now.getHours()).padStart(2, '0')
    const minutes = String(now.getMinutes()).padStart(2, '0')
    const seconds = String(now.getSeconds()).padStart(2, '0')

    return `${hours}:${minutes}:${seconds}`
}

async function sendSecureRequest(jsonData) {
    try {
        const encrypted = ENCRYPTOR.encrypt(JSON.stringify(jsonData), STATE.PHRASE_2)

        const response = await axios.post("/api/client", {
            data: encrypted
        }, {
            headers: {
                "Content-Type": "application/json"
            }
        })

        if (response.status !== 200) {
            return { error: "Request failed: Access Denied." }
        }

        const responseData = response.data
        if (responseData.hasOwnProperty("error")) {
            return responseData
        }

        const decrypted = ENCRYPTOR.decrypt(responseData.data, STATE.PHRASE_1)
        if (decrypted.length == 0) {
            return { error: "Phrase error." }
        }

        return JSON.parse(decrypted)
    } catch (error) {
        return { error: `Request failed: ${error.message}` }
    }
}

// authform
authForm.addEventListener("submit", async function (e) {
    try {
        e.preventDefault()

        const phrase1 = e.target.p1.value.trim()
        const phrase2 = e.target.p2.value.trim()

        if (!phrase1 || !phrase2) return alert("Invalid phrase values.")
        STATE.PHRASE_1 = phrase1
        STATE.PHRASE_2 = phrase2

        const response = await sendSecureRequest({
            action: "AUTH",
            phrase1
        })

        if (response.hasOwnProperty("error")) {
            STATE.reset()
            return alert(response.error)
        }

        if (response.data !== "OK") {
            return alert("Access denied.")
        }

        authForm.classList.remove("active")
        rootApp.classList.add("active")

        const socket = io("", {
            transports: ["websocket"],
            secure: true
        })

        socket.on("data", async response => {
            if (response.hasOwnProperty("error")) {
                return alert(response.error)
            }

            try {
                const decrypted = ENCRYPTOR.decrypt(response.data, STATE.PHRASE_1)
                const data = JSON.parse(decrypted)
                await handleSocketActions(data)
            } catch (error) {
                console.log(error)
                alert("socket failed.")
            }
        })

        const fetchUsers = await sendSecureRequest({ action: "GET_USERS" })
        if (fetchUsers.hasOwnProperty("error")) {
            STATE.reset()
            return alert(fetchUsers.error)
        }

        APP_DATA.users = fetchUsers.data.map(userObj => {
            return userObj.userAddress
        })

        APP_DATA.users.forEach(userAddress => {
            TEMPLATES.user(userAddress)
        })
    } catch (error) {
        STATE.reset()
        console.log(error)
        alert(`Failed to access. ${error.message}`)
    }
})

// userform
userForm.addEventListener("submit", async (e) => {
    e.preventDefault()

    const action = e.target.userAction.value
    let userAddress = e.target.userAddress.value

    try {
        const parsedAddress = new URL(userAddress)
        if (location.origin === parsedAddress.origin) {
            return alert("Error: Same server URL.")
        }

        userAddress = parsedAddress.origin
    } catch (error) {
        return alert("Error: Invalid URL")
    }

    const response = await sendSecureRequest({
        action,
        userAddress,
        thisUserAddress: location.origin,
    })

    if (action == "ADD_USER" && response.data) {
        TEMPLATES.user(userAddress)
    }

    if (action == "DOWNLOAD_MESSAGES" && response.data) {
        const jsonData = JSON.stringify(response.data, null, 2)
        const blob = new Blob([jsonData], { type: "application/json" })
        const url = URL.createObjectURL(blob)

        const link = document.createElement("a")
        link.download = "message.json"
        link.href = url

        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(url)
        return
    }

    if (action == "CLEAR_MESSAGES") {
        APP_DATA.messages[userAddress] = []
        if (APP_DATA.currentUser == userAddress) {
            messageContainer.innerHTML = ""
        }
    }

    userFormMessageBox.innerHTML = `[response] > ${response.error || response.data}`
})

// chatForm
chatForm.addEventListener("submit", async (e) => {
    e.preventDefault()
    if (!APP_DATA.currentUser) return

    try {
        const text = escapeHTML(e.target.text.value)
        const time = getCurrentTime()
        const type = "text"

        const response = await sendSecureRequest({
            action: "MESSAGE_TO_REMOTE",
            type,
            time,
            data: text,
            userAddress: APP_DATA.currentUser,
            thisUserAddress: location.origin
        })

        TEMPLATES.messageLine({
            type,
            time,
            data: text,
            userAddress: APP_DATA.currentUser,
            status: response
        })

        e.target.text.value = ""
        messageContainer.scrollTop = messageContainer.scrollHeight
    } catch (error) {
        alert(`Failed to send message. ${error.message}`)
    }
})

uploadFile.addEventListener("click", () => {
    if (!APP_DATA.currentUser) return

    const input = document.createElement("input")
    input.type = "file"
    input.click()

    input.addEventListener("change", (e) => {
        if (!confirm("Do you want to upload?")) return

        const file = e.target.files[0]
        if (!file) {
            alert("No file selected.")
            return
        }

        if (file.size > fileMaxSize) {
            alert("Error: File size exceeds 10MB limit.")
            return
        }

        const reader = new FileReader()

        reader.onload = async (event) => {
            const filename = escapeHTML(file.name)
            const type = "binary"
            const time = getCurrentTime()
            const data = event.target.result

            const response = await sendSecureRequest({
                action: "MESSAGE_TO_REMOTE",
                type,
                time,
                data,
                filename,
                userAddress: APP_DATA.currentUser,
                thisUserAddress: location.origin
            })

            TEMPLATES.messageLine({
                type,
                time,
                data,
                filename,
                userAddress: APP_DATA.currentUser,
                status: response
            })

            messageContainer.scrollTop = messageContainer.scrollHeight
        }

        reader.onerror = () => {
            alert("Failed to readfile.")
        }

        reader.readAsDataURL(file)
    })
})

const TEMPLATES = {
    user(userAddress) {
        const btn = document.createElement("button")
        btn.className = "user"
        btn.innerHTML = `<p>${userAddress}</p>`
        btn.title = userAddress
        usersContainer.appendChild(btn)

        btn.addEventListener("click", async () => {
            APP_DATA.currentUser = userAddress
            chatForm.classList.add("active")

            usersContainer.querySelectorAll(".user").forEach(user => {
                user.classList.remove("active")
            })
            btn.classList.add("active")
            toUserText.innerText = userAddress
            messageContainer.innerHTML = ""

            if (APP_DATA.messages[userAddress] == null) {
                const response = await sendSecureRequest({
                    action: "DOWNLOAD_MESSAGES",
                    userAddress,
                    thisUserAddress: location.origin
                })

                if (response.hasOwnProperty("error")) {
                    return alert(response.error)
                }

                APP_DATA.messages[userAddress] = response.data
            }

            for (const messageObj of APP_DATA.messages[userAddress]) {
                messageObj.status = "OK"
                TEMPLATES.messageLine(messageObj)
            }

            messageContainer.scrollTop = messageContainer.scrollHeight
        })
    },
    messageLine({ type, time, data, userAddress, status, remote, filename }) {
        let messageText = type == "text"
            ? data
            : `<a title="Click to download" class="file">[FILE]: ${filename}</a>`

        if (status != "OK") {
            messageText = type == "text"
                ? `[${status}] ${data}`
                : `<a class="file">[${status}] FILE: ${filename}</a>`
        }

        const div = document.createElement("div")
        div.className = "line"
        div.innerHTML = `<div class="head">
        <b class="${status == "OK" ? '' : "active"}">${remote ? "&gt;" : "&lt;"}</b>
        <span class="time">[${time}]</span><span class="${remote ? 'remote' : ''}">/${remote ? new URL(userAddress).host : location.host}</span>
        </div>
        <pre>${messageText}</pre>`

        const file = div.querySelector(".file")
        if (file) {
            file.addEventListener("click", () => {
                const link = document.createElement("a")
                link.href = data
                link.download = filename
                document.body.appendChild(link)
                link.click()
                document.body.removeChild(link)
            })
        }

        messageContainer.appendChild(div)
    }
}

messageContainer.addEventListener("scroll", () => {
    APP_DATA.atBottom = (messageContainer.scrollTop + messageContainer.clientHeight
        >= messageContainer.scrollHeight - 5)
})

async function handleSocketActions(options) {
    switch (options.action) {
        case "MESSAGE": {
            options.status = "OK"
            if (APP_DATA.messages[options.userAddress] == null) {
                const response = await sendSecureRequest({
                    action: "DOWNLOAD_MESSAGES",
                    userAddress: options.userAddress,
                    thisUserAddress: location.origin
                })

                if (response.hasOwnProperty("error")) {
                    return alert(response.error)
                }

                APP_DATA.messages[options.userAddress] = response.data
            } else {
                APP_DATA.messages[options.userAddress].push(options)
            }

            if (APP_DATA.currentUser == options.userAddress) {
                TEMPLATES.messageLine(options)

                if (APP_DATA.atBottom) {
                    messageContainer.scrollTop = messageContainer.scrollHeight
                }
            }

            break
        }

        case "ADD_USER": {
            TEMPLATES.user(options.userAddress)
            break
        }
    }
}