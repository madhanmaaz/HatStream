console.log("HATSTREM - chat")
// document.addEventListener("contextmenu", function (event) {
//     event.preventDefault()
// })

document.addEventListener("keydown", (e) => {
    const forbiddenKeys = ["F12", "I", "J", "U"]
    if (forbiddenKeys.includes(e.key) && (e.ctrlKey || e.shiftKey)) {
        e.preventDefault()
    }
})

const authForm = document.querySelector("#auth-form")
const mainContainer = document.querySelector(".container")
const sidebarContainer = document.querySelector(".sidebar")
const userForm = document.querySelector("#user-form")
const usersDatalist = document.querySelector("#users-datalist")
const usersContainer = document.querySelector("#users-container")
const fromUserText = document.querySelector("#from-user-text")
const toUserText = document.querySelector("#to-user-text")
const messageContainer = document.querySelector(".message-content")
const chatForm = document.querySelector("#chat-form")
const messageInput = document.querySelector("#message-input")
const messageBtn = document.querySelector("#message-btn")
const uploadFile = document.querySelector("#upload-file")
const loggerContent = document.querySelector("#logger-content")

document.querySelector("#close-access").addEventListener("click", () => {
    location.reload()
})

document.querySelector("#open-sidebar").addEventListener("click", () => {
    sidebarContainer.classList.add("active")
})

document.querySelector("#close-sidebar").addEventListener("click", () => {
    sidebarContainer.classList.remove("active")
})

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

function typingText(element, data, sElement) {
    let count = 0
    const interval_ = setInterval(() => {
        const span = document.createElement("span")
        span.classList.add("char")
        span.innerText = data[count]
        element.append(span)

        count++
        if (count === data.length) {
            clearInterval(interval_)
        }

        if (sElement) {
            sElement.scrollTop = sElement.scrollHeight
        }
    }, 20)
}

function addLog(data) {
    const p = document.createElement("p")
    p.title = getCurrentTime()
    loggerContent.appendChild(p)
    typingText(p, data, loggerContent)
}

// app
const STATE = {
    PHRASE_1: null,
    PHRASE_2: null,
    resetPhrase() {
        this.PHRASE_1 = null
        this.PHRASE_2 = null
    },
    users: {},
    messages: {},
    currentUser: null,
    atBottom: null,
    fileMaxSize: 10 * 1024 * 1024
}

fromUserText.innerText = location.origin
addLog("> Enter access phrase values.")

async function sendSecureRequest(jsonData) {
    try {
        const encryptedBinary = AES.encrypt(jsonData, STATE.PHRASE_2)
        const file = new Blob([encryptedBinary], { type: 'application/octet-stream' })
        const formData = new FormData()
        formData.append('enc', file, 'enc.bin')

        const response = await axios.post("/api/client", formData, {
            responseType: "arraybuffer"
        })

        if (response.status !== 200) {
            return addLog("> Request failed: Access Denied.")
        }

        const encryptedResponse = new Uint8Array(response.data)
        const decrypted = AES.decrypt(encryptedResponse, STATE.PHRASE_1)
        if (!decrypted) {
            return addLog("> Incorrect phrase values.")
        }

        if (decrypted.hasOwnProperty("error")) {
            return addLog(`> ${decrypted.error}`)
        }

        return decrypted
    } catch (error) {
        console.log(error)
        addLog(`> Error: ${error.message}`)
    }
}

// authform
authForm.addEventListener("submit", async function (e) {
    try {
        e.preventDefault()

        const phrase1 = e.target.p1.value.trim()
        const phrase2 = e.target.p2.value.trim()

        if (!phrase1 || !phrase2) return addLog("> Invalid phrase values.")
        STATE.PHRASE_1 = phrase1
        STATE.PHRASE_2 = phrase2

        const response = await sendSecureRequest({
            action: "AUTH",
            phrase1
        })

        if (!response) return
        addLog("> Access granted.")
        authForm.classList.remove("active")
        mainContainer.classList.add("active")

        const socket = io("", {
            transports: ["websocket"],
            secure: true
        })

        socket.on("data", async response => {
            if (response.hasOwnProperty("error")) {
                return addLog(`> ${response.error}`)
            }

            try {
                const decrypted = AES.decrypt(response.data, STATE.PHRASE_1)
                await handleSocketActions(decrypted)
            } catch (error) {
                console.log(error)
                addLog(`> Socket error: ${error.message}`)
            }
        })

        const fetchUsers = await sendSecureRequest({ action: "GET_USERS" })
        if (!fetchUsers) return

        STATE.users = fetchUsers.data.map(userObj => {
            return userObj.userAddress
        })

        STATE.users.forEach(userAddress => {
            TEMPLATES.addUserDataList(userAddress)
            TEMPLATES.user(userAddress)
        })
    } catch (error) {
        console.log(error)
        STATE.reset()
        addLog(`> Failed to access: ${error.message}`)
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
            return addLog("> Error: Same server URL.")
        }

        userAddress = parsedAddress.origin
    } catch (error) {
        console.log(error)
        return addLog("> Error: Invalid URL")
    }

    e.submitter.setAttribute("disabled", true)
    const response = await sendSecureRequest({
        action,
        userAddress,
        thisUserAddress: location.origin,
    })

    e.submitter.removeAttribute("disabled")
    if (!response) return

    if (action == "DOWNLOAD_MESSAGES") {
        if (response.data.length == 0) return addLog("> 0 messages.")

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

    addLog(`> ${response.data}`)
    if (action == "ADD_USER") {
        TEMPLATES.user(userAddress)
    } else if (action == "CLEAR_MESSAGES") {
        STATE.messages[userAddress] = []
        if (STATE.currentUser == userAddress) {
            messageContainer.innerHTML = ""
        }
    }
})

// chatForm
async function sendChat() {
    if (!STATE.currentUser) return

    try {
        const text = messageInput.value.trim()
        if (!text) {
            messageInput.focus()
            return
        }
        messageBtn.setAttribute("disabled", true)
        messageInput.setAttribute("readonly", true)

        const time = getCurrentTime()
        const type = "text"

        const response = await sendSecureRequest({
            action: "MESSAGE_TO_REMOTE",
            type,
            time,
            data: text,
            userAddress: STATE.currentUser,
            thisUserAddress: location.origin
        })

        messageBtn.removeAttribute("disabled")
        messageInput.removeAttribute("readonly")

        if (!response) return
        TEMPLATES.messageLine({
            type,
            time,
            data: text,
            userAddress: STATE.currentUser
        })

        messageContainer.scrollTop = messageContainer.scrollHeight
        messageInput.value = ""
    } catch (error) {
        console.log(error)
        addLog(`> Failed to send message: ${error.message}`)
    }
}

messageBtn.addEventListener("click", sendChat)
messageInput.addEventListener("keydown", async (e) => {
    if (e.key === "Enter" && e.ctrlKey) {
        await sendChat()
    }
})

uploadFile.addEventListener("click", () => {
    if (!STATE.currentUser) return

    const input = document.createElement("input")
    input.type = "file"
    input.click()

    input.addEventListener("change", (e) => {
        if (!confirm("Do you want to upload?")) return

        const file = e.target.files[0]
        if (!file) {
            return addLog("> No file selected.")
        }

        if (file.size > STATE.fileMaxSize) {
            return addLog("> Error: File size exceeds 10MB limit.")
        }

        const reader = new FileReader()
        reader.onload = async (event) => {
            const filename = file.name
            const type = "binary"
            const time = getCurrentTime()
            const data = arrayBufferToBase64(event.target.result)

            const response = await sendSecureRequest({
                action: "MESSAGE_TO_REMOTE",
                type,
                time,
                data,
                filename,
                ftype: file.type,
                userAddress: STATE.currentUser,
                thisUserAddress: location.origin
            })

            if (!response) return
            TEMPLATES.messageLine({
                type,
                time,
                data,
                filename,
                ftype: file.type,
                userAddress: STATE.currentUser
            })

            messageContainer.scrollTop = messageContainer.scrollHeight
        }

        reader.onerror = () => {
            addLog("> Failed to readfile.")
        }

        reader.readAsArrayBuffer(file)
    })
})

function arrayBufferToBase64(buffer) {
    let binary = ''
    const bytes = new Uint8Array(buffer)
    const len = bytes.byteLength
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i])
    }
    return window.btoa(binary)
}

const TEMPLATES = {
    addUserDataList(userAddress) {
        const option = document.createElement("option")
        option.value = userAddress
        usersDatalist.appendChild(option)
    },
    user(userAddress) {
        const btn = document.createElement("button")
        btn.className = "user"
        btn.innerHTML = `<p>${userAddress}</p>`
        btn.title = userAddress
        usersContainer.appendChild(btn)

        btn.addEventListener("click", async () => {
            if (window.innerWidth < 1000) {
                sidebarContainer.classList.remove("active")
                mainContainer.classList.add("active")
            }

            STATE.currentUser = userAddress
            chatForm.classList.add("active")

            usersContainer.querySelectorAll(".user").forEach(user => {
                user.classList.remove("active")
            })
            btn.classList.add("active")
            toUserText.innerText = userAddress
            messageContainer.innerHTML = ""

            if (STATE.messages[userAddress] == null) {
                const response = await sendSecureRequest({
                    action: "DOWNLOAD_MESSAGES",
                    userAddress,
                    thisUserAddress: location.origin
                })

                if (response.hasOwnProperty("error")) {
                    return addLog(`> ${response.error}`)
                }

                STATE.messages[userAddress] = response.data
            }

            for (const messageObj of STATE.messages[userAddress]) {
                TEMPLATES.messageLine(messageObj)
            }

            messageContainer.scrollTop = messageContainer.scrollHeight
        })
    },
    messageLine(messageObj, typingAnimation) {
        const { type, time, data, userAddress, ftype, remote, filename } = messageObj
        const messageText = type == "text"
            ? (typingAnimation ? data : escapeHTML(data))
            : createUiForFile(filename, ftype, data)

        const div = document.createElement("div")
        div.classList.add("line")
        remote ? div.classList.add("remote") : null
        div.innerHTML = `
        <div class="head">
            <span class="indicator">${remote ? "&gt;" : "&lt;"}</span>
            <span class="username">${remote ? "REMOTE" : "YOU"}</span>
            <b></b>
            <span class="time">${time}</span>
        </div>
        <pre class="message-text">${typingAnimation ? "" : messageText}</pre>`

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

        // adding typing
        if (typingAnimation) {
            typingText(
                div.querySelector(".message-text"),
                messageText,
                messageContainer
            )
        }
    }
}

messageContainer.addEventListener("scroll", () => {
    STATE.atBottom = (messageContainer.scrollTop + messageContainer.clientHeight
        >= messageContainer.scrollHeight - 5)
})

async function handleSocketActions(options) {
    switch (options.action) {
        case "MESSAGE": {
            if (STATE.messages[options.userAddress] == null) {
                const response = await sendSecureRequest({
                    action: "DOWNLOAD_MESSAGES",
                    userAddress: options.userAddress,
                    thisUserAddress: location.origin
                })

                if (response.hasOwnProperty("error")) {
                    return addLog(`> ${response.error}`)
                }

                STATE.messages[options.userAddress] = response.data
            } else {
                STATE.messages[options.userAddress].push(options)
            }

            if (STATE.currentUser == options.userAddress) {
                TEMPLATES.messageLine(options, options.type == "text")

                if (STATE.atBottom) {
                    messageContainer.scrollTop = messageContainer.scrollHeight
                }
            } else {
                addLog(`> msg: ${options.userAddress}`)
            }

            break
        }

        case "ADD_USER": {
            TEMPLATES.addUserDataList(options.userAddress)
            TEMPLATES.user(options.userAddress)
            addLog(`> New user added to your server: ${options.userAddress}`)
            break
        }
    }
}

function createUiForFile(filename, type, data) {
    if (!type || !data) return ""

    let html = `<button title="Click to download" class="file">DOWNLOAD FILE: ${escapeHTML(filename)}</button>`
    if (type.startsWith("image")) {
        html += `<img src="data:${type};base64,${data}" alt="Image">`
    } else if (type.startsWith("audio")) {
        html += `<audio controls><source src="data:${type};base64,${data}" type="${type}">Your browser does not support the audio element.</audio>`
    } else if (type.startsWith("video")) {
        html += `<video controls><source src="data:${type};base64,${data}" type="${type}">Your browser does not support the video tag.</video>`
    }

    return html
}