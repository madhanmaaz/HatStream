# HatStream for Hackers - Secure Decentralized Chat App

- HatStream is a fully decentralized, server-to-server chat application with end-to-end encryption using AES. there is no central server.

<p align=center>
<img src="./public/favicon.ico">
</p>

#### This is my server: https://madhanmaaz.glitch.me, let's chat

### DEMO
https://github.com/user-attachments/assets/7397523d-6908-42d7-9513-3e103d3410ba

![screen](./scr/1.jpg)
![screen](./scr/2.jpg)

### 🚀  Features
- **Server-to-Server Communication**: No central server; each user hosts their own chat server.

- **AES Encryption**: Messages are encrypted before transmission, preventing interception.

- **Decentralized Discovery**: Users communicate using shared server URLs.

### 🔧 How It Works
- **Host Your Own HatStream Server**: Each user runs a server instance.

- **Exchange Server URLs**: To chat, users share their server URLs.

- **End-to-End Encryption**: Messages are encrypted using AES before being sent.

- **Server-to-Server Communication**: Messages are sent directly between user-hosted servers.

### 📥 Installation
```bash
git clone https://github.com/madhanmaaz/HatStream
npm install
npm start
```

### 🔒 Add Phrase to ENV and Access It Later
```
PHRASE_1=<YOUR_SECRET_PHRASE_1>
PHRASE_2=<YOUR_SECRET_PHRASE_2>
```
