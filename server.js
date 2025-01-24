process.__dirname = __dirname

const socketIO = require("socket.io")
const express = require("express")
const http = require("http")
const path = require("path")

const helpers = require("./utils/helpers")

const app = express()
const server = http.createServer(app)
const io = new socketIO.Server(server)

app.use(express.static(path.join(__dirname, "public")))
app.use(express.urlencoded({ extended: false }))
app.use(express.json({ limit: "15mb" }))

global.IO = io

// API
app.use("/api", require("./router/api"))

// Socket
io.on("connection", (socket) => {
    helpers.CLIENTS[socket.id] = 1

    socket.on("disconnect", () => {
        delete helpers.CLIENTS[socket.id]
    })
})

const PORT = process.env.PORT || process.argv[2] || 3000
server.listen(PORT, () => {
    console.log(`Running on port: ${PORT}`)
})