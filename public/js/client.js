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
            return alert("Request failed: Access Denied.")
        }

        const responseData = response.data
        if (responseData.hasOwnProperty("$error")) {
            return alert(responseData.$error)
        }

        const decrypted = ENCRYPTOR.decrypt(responseData.data, STATE.PHRASE_1)
        if (!decrypted) {
            return alert("Incorrect phrase values.")
        }

        const decryptedData = JSON.parse(decrypted)
        if (decryptedData.hasOwnProperty("$error")) {
            return alert(decryptedData.$error)
        }

        return decryptedData
    } catch (error) {
        console.log(error)
        return alert(`Request failed: ${error.message}`)
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

        if (!response) return
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
            if (response.hasOwnProperty("$error")) {
                return alert(response.$error)
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
        if (!fetchUsers) return
        APP_DATA.users = fetchUsers.data.map(userObj => {
            return userObj.userAddress
        })

        APP_DATA.users.forEach(userAddress => {
            TEMPLATES.addUserDataList(userAddress)
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
        console.log(error)
        return alert("Error: Invalid URL")
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

    alert(response.data)
    if (action == "ADD_USER") {
        TEMPLATES.user(userAddress)
    } else if (action == "CLEAR_MESSAGES") {
        APP_DATA.messages[userAddress] = []
        if (APP_DATA.currentUser == userAddress) {
            messageContainer.innerHTML = ""
        }
    }
})

// chatForm
chatForm.addEventListener("submit", async (e) => {
    e.preventDefault()
    if (!APP_DATA.currentUser) return

    try {
        e.submitter.setAttribute("disabled", true)
        e.target.text.setAttribute("readonly", true)

        const text = escapeHTML(e.target.text.value)
        if (!text) return
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

        e.submitter.removeAttribute("disabled")
        e.target.text.removeAttribute("readonly")

        if (!response) return
        TEMPLATES.messageLine({
            type,
            time,
            data: text,
            userAddress: APP_DATA.currentUser
        })

        e.target.text.value = ""
        messageContainer.scrollTop = messageContainer.scrollHeight
    } catch (error) {
        console.log(error)
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
                ftype: file.type,
                userAddress: APP_DATA.currentUser,
                thisUserAddress: location.origin
            })

            if (!response) return
            TEMPLATES.messageLine({
                type,
                time,
                data,
                filename,
                ftype: file.type,
                userAddress: APP_DATA.currentUser
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
                TEMPLATES.messageLine(messageObj)
            }

            messageContainer.scrollTop = messageContainer.scrollHeight
        })
    },
    messageLine({ type, time, data, userAddress, ftype, remote, filename }) {
        const messageText = type == "text"
            ? data
            : createUiForFile(filename, ftype, data)

        const div = document.createElement("div")
        div.className = "line"
        div.innerHTML = `
        <div class="head">
            <b>${remote ? "&gt;" : "&lt;"}</b>
            <span class="time">${time}</span>
            <span class="${remote ? 'remote' : ''}">&#183; ${remote ? "REMOTE" : "YOU"}</span>
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
            TEMPLATES.addUserDataList(options.userAddress)
            TEMPLATES.user(options.userAddress)
            break
        }
    }
}

function createUiForFile(filename, type, data) {
    if (!type || !data) return ""

    let html = `<button title="Click to download" class="file">DOWNLOAD FILE: ${filename}</button>`
    if (type.startsWith("image")) {
        html += `<img src="${data}" alt="Image">`
    } else if (type.startsWith("audio")) {
        html += `<audio controls><source src="${data}" type="${type}">Your browser does not support the audio element.</audio>`
    } else if (type.startsWith("video")) {
        html += `<video controls><source src="${data}" type="${type}">Your browser does not support the video tag.</video>`
    }

    return html
}