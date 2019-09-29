const canvas = document.querySelector("#canvas");
const ctx = canvas.getContext('2d');
let cvX = canvas.width;
let cvY = canvas.height;

const setCookie = (name, value, days) => {
    let date = new Date();
    date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
    let expires = "; expires=" + date.toGMTString();
    document.cookie = name + "=" + value + expires + "; path=/";
}

const getCookie = (name) => {
    let cArr = document.cookie.split(';');
    for (let i = 0; i < cArr.length; i++) {
        let cookie = cArr[i]; // do not use split("=") as it may remove other "="
        cookie = cookie.replace(/^\s+/, "");
        let head = name+ "=";
        if (cookie.indexOf(head) == 0) {
            return cookie.substring(head.length, cookie.length);
        }
    }
    return null;
}

// WebSocket Connection Variables
let serverAddr = "ws://rotar.tk:8989";
let selfAuthKey = 0;
let controllerAuthKey = 0;

// Reconnect Vars
let retryCnt = 0;
let retryMax = 10;
let retryDelay = 1000;

// Create WebSocket connection.
let socket; // = new WebSocket('ws://localhost:8080', "echo-protocol"); //

const wsLog = (msg, speaker = "") => {
    console.log(speaker + " : " + msg);
}

const wsConn = (addr, protocol) => {
    wsLog("Establishing WebSocket connection...", "Info");
    socket = new WebSocket(addr, protocol);
    // Connection opened
    socket.addEventListener('open', function (event) {
        retryCnt = 0; // clear retry counter
        wsLog("WebSocket connection established.", "Info");
        //wsSend('Hello Server!');
        // Identify or Request for new identity
        let authKey = getCookie("AUTHKEY");
        let msg = {};
        if (authKey !== null){ // exists
            msg.cmd = "AUTH_VERIFY";
            msg.payload = {};
            msg.payload.authKey = authKey; //encodeURIComponent(authKey);
        }else{
            msg.cmd = "AUTH_REQUEST";
            msg.payload = {};
        }
        wsSend(JSON.stringify(msg));
    });

    // Listen for messages
    socket.addEventListener('message', function (event) {
        wsRecv(event.data);
    });

    // Listen for error
    socket.addEventListener('error', function (event) {
        //console.log(event);
        wsLog("WebSocket connection lost or cannot be established.", "Error");
        if (retryCnt >= retryMax) {
            wsLog("Maximum number of reconnection attempts reached.", "Error");
        } else {
            retryCnt++;
            setTimeout(() => {
                wsLog(`Reconnection attempt No.${retryCnt}...`, "Info");
                wsConn(addr, protocol);
            }, retryDelay);
        }
    });

    // Listen for close
    // socket.addEventListener('close', function (event) {
    //     //console.log(event);
    //     wsLog("WebSocket connection closed.", "Info");
    // });
}

const wsSend = (msg) => {
    if (socket.readyState !== 1) { // if state is not OPEN
        wsLog("No WebSocket connection available!", "Error");
        return;
    }
    try {
        let msgJSON = JSON.parse(msg);
        switch(msgJSON.cmd){
            case "AUTH_VERIFY":
            case "AUTH_REQUEST":
                console.log(msgJSON);
                break;
            case "MSG_SEND":
                wsLog(msgJSON.payload.message, "Me");
                break;
            default:
                wsLog(msgJSON.payload, "Me");
                break;        
        }
    } catch (error) {
        wsLog(msg, "Me");   
    }
    socket.send(msg);
}

const wsRecv = (msg) => {
    try {
        let msgJSON = JSON.parse(msg);
        switch(msgJSON.cmd){
            case "AUTH_RESPONSE":
                setCookie("AUTHKEY", msgJSON.payload.authKey, 30);
                selfAuthKey = msgJSON.payload.id;
                break;
            case "MSG_INCOMING":
                wsLog(msgJSON.payload.message, msgJSON.payload.senderId);
                break;
            case "CONTROL_CONNECT":
                gameState = GameStates.CONNECTED;
                break;
            case "CONTROL_DISCONNECT":
                gameState = GameStates.WAITING;
                break;
            case "CONTROL_COMMAND":
                switch(msgJSON.payload.message){
                    case "up":
                        moveUp();
                        break;
                    case "down":
                        moveDown();
                        break;
                    case "left":
                        moveLeft();
                        break;
                    case "right":
                        moveRight();
                        break;
                    default:
                        break;
                }
                break;
            default:
                wsLog(msgJSON.payload, "Server");
                break;        
        }
    } catch (error) {
        wsLog(msg, "Server");   
    }
}

// Clear the canvas
const canvasClear = () => {
    ctx.clearRect(0,0,cvX,cvY);
};

// Draw the grid for the maze
const drawGrid = (row, col, borderWidth, spaceWidth, style = "rgb(0,0,100)") => {
    for(var i=0;i<row;++i){
        for(var j = 0;j<col;++j){
            ctx.save();    
            ctx.strokeStyle = style;
            ctx.lineWidth = borderWidth;
            ctx.strokeRect(borderWidth/2 + i * (borderWidth + spaceWidth),
            borderWidth/2 + j * (borderWidth + spaceWidth), 
            (i+1) * (borderWidth + spaceWidth), 
            (j+1) * (borderWidth + spaceWidth));
            ctx.restore();
        }
    }
}

const drawCircle = (x, y, radius, width = 1, 
    fillColor = "rgb(0,100,177)",
    outlineColor = "rgb(245,128,38)") => {
    ctx.save();
    ctx.strokeStyle = outlineColor;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI*2, false);
    ctx.stroke();
    ctx.fillStyle = fillColor;
    ctx.fill();
    ctx.closePath();
    ctx.restore();
  };


const drawText = (text,
        x = canvas.width/2,
        y = canvas.height/2,
        font = "30px Trebuchet MS, Trbuchet, Arial", 
        style = "rgb(0,100,177)", 
        align = "center") => {
    ctx.save();
    ctx.font = font;
    ctx.fillStyle = style;
    ctx.textAlign = align;
    ctx.fillText(text, x, y); 
    ctx.restore();
}

// ===== Game Variables =====

// Coordinate of Ball
const curCoordinate = [0,0];

// Map, 0 = hole, 1 = floor, 2 = exit
const mapArr = [
    [1, 0, 1, 0, 1],
    [1, 1, 1, 0, 1],
    [0, 0, 1, 0, 1],
    [1, 1, 1, 1, 0],
    [1, 0, 0, 1, 2]
];

// 0 - Initiated, 1 - Connected, 2 - Finished
const GameStates = {
    WAITING: 0,
    CONNECTED: 1,
    DIED: 2,
    WON: 3
}

let gameState = GameStates.WAITING;

const drawMap = (arr, borderWidth, spaceWidth, 
    styleHole = "rgb(10,10,10)", 
    styleFloor = "rgb(200,200,200)", 
    styleExit = "rgb(0,255,0)") => {

    const row = arr.length;
    const col = arr[0].length;

    for(var i=0;i<row;++i){
        for(var j=0;j<col;++j){
            ctx.save();  
            switch(arr[i][j]){
                case 0:
                    ctx.fillStyle = styleHole;
                    break;  
                case 1:
                    ctx.fillStyle = styleFloor;
                    break;
                case 2:
                    ctx.fillStyle = styleExit;
                    break;
            }
            // TODO: Fix this
            let upleftX = borderWidth + j * (borderWidth + spaceWidth);
            let upleftY = borderWidth + i * (borderWidth + spaceWidth);
            ctx.fillRect(upleftX, upleftY, 
                (j+1) * (borderWidth + spaceWidth),
                (i+1) * (borderWidth + spaceWidth));
            ctx.restore();
        }
    }
}

// Main Loop
const render = timestamp => {
    canvasClear();

    switch(gameState){
        case GameStates.WAITING:
            let msg = "";
            if (selfAuthKey == 0){
                msg = "Connecting to Server...";
                drawText(msg);
            }else{
                msg = "Your ID: " + selfAuthKey;
                drawText(msg, canvas.width/2, canvas.height/2 - 20);
                msg = "Waiting for Connection...";
                drawText(msg, canvas.width/2, canvas.height/2 + 20);
            }
            break;
        case GameStates.CONNECTED:
            drawMap(mapArr,10,80);
            drawGrid(5,5,10,80);
            drawCircle(50 + 90 * (curCoordinate[0]),
                50 + 90 * (curCoordinate[1]) ,38,4);
                
            // Determine if lost/won
            let curBlock = mapArr[curCoordinate[1]][curCoordinate[0]];
            console.log(curBlock);
            if (curBlock == 0){
                //alert("YOU DIED");
                gameState = GameStates.DIED;
            }else if(curBlock == 2){
                //alert("YOU WON");
                gameState = GameStates.WON;
            }

            break;
        case GameStates.DIED:
            drawText("You've Lost!");
            break;
        case GameStates.WON:
            drawText("You've Won!");
            break;
    }

    window.requestAnimationFrame(render);
  };

window.requestAnimationFrame(render);

wsConn(serverAddr, "echo-protocol");

const moveUp = () => {
    if (curCoordinate[1] > 0){
        curCoordinate[1] = curCoordinate[1] - 1;
    }    
}

const moveDown = () => {
    if (curCoordinate[1] < (mapArr.length-1)){
        curCoordinate[1] = curCoordinate[1] + 1;
    }   
}

const moveLeft = () => {
    if (curCoordinate[0] > 0){
        curCoordinate[0] = curCoordinate[0] - 1;
    }
}

const moveRight = () => {
    if (curCoordinate[0] < (mapArr[0].length - 1)){
        curCoordinate[0] = curCoordinate[0] + 1;
    }
}

window.addEventListener('keyup',(e) => {
    console.log(e.keyCode);
    const keyCode = e.keyCode || e.which;

    if(gameState == GameStates.WAITING) { // Waiting for connection
        if (keyCode == 84){ // 't' for testing
            gameState = GameStates.CONNECTED;
        }
        return;
    }

    if(gameState >= GameStates.DIED) {
        if (keyCode == 82){ // 'r' for retry
            // reset char location
            curCoordinate[0] = 0;
            curCoordinate[1] = 0;
            gameState = GameStates.CONNECTED;
        }
        return;
    };

    if(gameState != GameStates.CONNECTED) return;

    switch(keyCode){
        case 39: // right arrow
            moveRight();
            break;
        case 38: // Up arrow        
            moveUp();
            break;
        case 37: // left arrow
            moveLeft();
            break;
        case 40: // down arrow
            moveDown();
            break;
    }
    console.log(curCoordinate);
})