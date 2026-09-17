const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = 3000;

const html = `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Consent Camera Share</title>

<style>
* {
    box-sizing: border-box;
}

body {
    margin: 0;
    min-height: 100vh;
    background: #050909;
    color: #00ff9d;
    font-family: Arial, sans-serif;
    display: flex;
    justify-content: center;
    align-items: center;
}

.box {
    width: 95%;
    max-width: 800px;
    padding: 25px;
    background: #0b1511;
    border: 1px solid #00ff9d;
    border-radius: 18px;
    text-align: center;
}

h1 {
    text-shadow: 0 0 15px #00ff9d;
}

p {
    color: #baffdf;
}

button {
    padding: 13px 20px;
    margin: 8px;
    border: 1px solid #00ff9d;
    background: transparent;
    color: #00ff9d;
    border-radius: 8px;
    cursor: pointer;
}

button:hover {
    background: #00ff9d;
    color: #000;
}

.stop {
    border-color: #ff5555;
    color: #ff5555;
}

video {
    width: 100%;
    margin-top: 20px;
    background: #000;
    border-radius: 12px;
}

.hidden {
    display: none;
}

#status {
    margin-top: 15px;
}
</style>
</head>

<body>

<div class="box">

<h1>📷 Consent Camera Share</h1>

<p>
Camera sharing starts only after the phone user
explicitly grants camera permission.
</p>

<div id="phonePanel">

<button onclick="startCamera()">
Allow Camera & Share
</button>

<button class="stop" onclick="stopCamera()">
Stop Sharing
</button>

<video
    id="localVideo"
    autoplay
    muted
    playsinline
></video>

</div>

<div id="viewerPanel" class="hidden">

<h2>💻 Laptop Viewer</h2>

<video
    id="remoteVideo"
    autoplay
    playsinline
></video>

</div>

<div id="status">
Connecting...
</div>

</div>

<script src="/socket.io/socket.io.js"></script>

<script>

const socket = io();

const params =
    new URLSearchParams(window.location.search);

const role =
    params.get("role") === "viewer"
        ? "viewer"
        : "phone";

const phonePanel =
    document.getElementById("phonePanel");

const viewerPanel =
    document.getElementById("viewerPanel");

const localVideo =
    document.getElementById("localVideo");

const remoteVideo =
    document.getElementById("remoteVideo");

const status =
    document.getElementById("status");

let stream = null;
let peer = null;
let viewerId = null;

const rtcConfig = {
    iceServers: [
        {
            urls: "stun:stun.l.google.com:19302"
        }
    ]
};

if (role === "viewer") {

    phonePanel.classList.add("hidden");

    viewerPanel.classList.remove("hidden");

    status.textContent =
        "Waiting for phone...";

}

socket.on("connect", () => {

    socket.emit("join", {
        role: role
    });

});

socket.on("phone-ready", () => {

    if (role === "viewer") {

        status.textContent =
            "Phone connected. Waiting for camera permission.";

    }

});

socket.on("request-viewer", () => {

    if (role === "viewer") {

        socket.emit("viewer-id", {
            id: socket.id
        });

    }

});

socket.on("viewer-id", ({ id }) => {

    if (role === "phone") {

        viewerId = id;

        createPhoneConnection();

    }

});

async function startCamera() {

    if (role !== "phone") {
        return;
    }

    try {

        stream =
            await navigator.mediaDevices.getUserMedia({

                video: {
                    facingMode: "environment"
                },

                audio: false

            });

        localVideo.srcObject = stream;

        status.textContent =
            "Camera permission granted.";

        socket.emit("request-viewer");

    }

    catch (error) {

        status.textContent =
            "Camera permission denied.";

        console.log(error);

    }

}

async function createPhoneConnection() {

    if (!stream || !viewerId) {
        return;
    }

    peer =
        new RTCPeerConnection(rtcConfig);

    stream
        .getTracks()
        .forEach(track => {

            peer.addTrack(
                track,
                stream
            );

        });

    peer.onicecandidate =
        event => {

            if (event.candidate) {

                socket.emit("signal", {

                    target: viewerId,

                    data: {
                        type: "candidate",
                        candidate: event.candidate
                    }

                });

            }

        };

    const offer =
        await peer.createOffer();

    await peer.setLocalDescription(
        offer
    );

    socket.emit("signal", {

        target: viewerId,

        data: peer.localDescription

    });

    status.textContent =
        "🔴 Camera sharing active.";

}

function createViewerConnection(sender) {

    peer =
        new RTCPeerConnection(rtcConfig);

    peer.ontrack =
        event => {

            remoteVideo.srcObject =
                event.streams[0];

            status.textContent =
                "🔴 Live camera stream";

        };

    peer.onicecandidate =
        event => {

            if (event.candidate) {

                socket.emit("signal", {

                    target: sender,

                    data: {
                        type: "candidate",
                        candidate: event.candidate
                    }

                });

            }

        };

}

socket.on("signal", async ({ sender, data }) => {

    if (role === "viewer") {

        if (!peer) {
            createViewerConnection(sender);
        }

        if (data.type === "offer") {

            await peer.setRemoteDescription(data);

            const answer =
                await peer.createAnswer();

            await peer.setLocalDescription(
                answer
            );

            socket.emit("signal", {

                target: sender,

                data: peer.localDescription

            });

        }

        if (data.type === "candidate") {

            try {

                await peer.addIceCandidate(
                    data.candidate
                );

            } catch (e) {

                console.log(e);

            }

        }

    }

    else {

        if (!peer) {
            return;
        }

        if (data.type === "answer") {

            await peer.setRemoteDescription(data);

        }

        if (data.type === "candidate") {

            try {

                await peer.addIceCandidate(
                    data.candidate
                );

            } catch (e) {

                console.log(e);

            }

        }

    }

});

function stopCamera() {

    if (stream) {

        stream
            .getTracks()
            .forEach(track => track.stop());

        stream = null;

    }

    if (peer) {

        peer.close();

        peer = null;

    }

    localVideo.srcObject = null;

    status.textContent =
        "Camera sharing stopped.";

}

</script>

</body>
</html>
`;

app.get("/", (req, res) => {
    res.send(html);
});

io.on("connection", socket => {

    socket.on("join", ({ role }) => {

        socket.join("camera-room");

        socket.data.role = role;

        if (role === "phone") {

            socket
                .to("camera-room")
                .emit("phone-ready");

        }

    });

    socket.on("request-viewer", () => {

        socket
            .to("camera-room")
            .emit("request-viewer");

    });

    socket.on("viewer-id", ({ id }) => {

        socket
            .to("camera-room")
            .emit("viewer-id", {
                id: id
            });

    });

    socket.on("signal", ({ target, data }) => {

        io.to(target).emit("signal", {
            sender: socket.id,
            data: data
        });

    });

    socket.on("disconnect", () => {

        socket
            .to("camera-room")
            .emit("peer-left");

    });

});

server.listen(PORT, "0.0.0.0", () => {

    console.log("");
    console.log("================================");
    console.log(" Consent Camera Server Started");
    console.log("================================");
    console.log("");
    console.log("Laptop viewer:");
    console.log("http://localhost:" + PORT + "/?role=viewer");
    console.log("");
});