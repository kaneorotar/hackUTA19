#!/usr/bin/env node
const WebSocketServer = require('websocket').server;
const http = require('http');
const crypto = require('crypto');
const url = require('url');

// WebSocket Server
const server = http.createServer(function(request, response) {
    console.log((new Date()) + ' Received request for ' + request.url);
    //response.writeHead(404);
    //response.end();    
    response.end('{"name":"another-person"}');
});
server.listen(8989, function() {
    console.log((new Date()) + ' Server is listening on port 8989');
});
let wsServer = new WebSocketServer({
    httpServer: server,
    // You should not use autoAcceptConnections for production
    // applications, as it defeats all standard cross-origin protection
    // facilities built into the protocol and the browser.  You should
    // *always* verify the connection's origin and decide whether or not
    // to accept it.
    autoAcceptConnections: false
});

// HTTP Server
const server1999 = http.createServer(function(request, response) {
    console.log((new Date()) + ' Received request for ' + request.url);
    //response.writeHead(404);

    let q = url.parse(request.url,true);
    console.log(q.query);

    // Try to find ID
    const userId = q.query.user_id.replace(/[^0-9]/g, ""); // clean it
    if (id2ConnDict[userId] !== undefined){ // found!
        if(q.query.cmd === undefined){ // invalid request!
            response.end(JSON.stringify({
                "ret": 0
            }));
            return;
        }
        
        let message = {};
        switch(q.query.cmd.toLocaleLowerCase()){
            case "connect":
                message.cmd = "CONTROL_CONNECT";
                message.payload = {};
                //message.payload.senderId = msgJSON.payload.senderId;
                //message.payload.targetId = targetId;
                //message.payload.message = msgJSON.payload.message;
                id2ConnDict[userId].sendUTF(JSON.stringify(message));
                response.end(JSON.stringify({
                    "ret": 1
                }));
                break;
            case "up":
            case "down":
            case "left":
            case "right":
                message.cmd = "CONTROL_COMMAND";
                message.payload = {};
                //message.payload.senderId = msgJSON.payload.senderId;
                //message.payload.targetId = targetId;
                message.payload.message = q.query.cmd.toLocaleLowerCase();
                id2ConnDict[userId].sendUTF(JSON.stringify(message));
                response.end(JSON.stringify({
                    "ret": 1
                }));
                break;
            case "quit":
            case "exit":
            case "disconnect":
                message.cmd = "CONTROL_DISCONNECT";
                message.payload = {};
                //message.payload.senderId = msgJSON.payload.senderId;
                //message.payload.targetId = targetId;
                //message.payload.message = msgJSON.payload.message;
                id2ConnDict[userId].sendUTF(JSON.stringify(message));
                response.end(JSON.stringify({
                    "ret": 2
                }));
                break;
            default:
                response.end(JSON.stringify({
                    "ret": 0
                }));
                break;
        }
    }else{
        response.end(JSON.stringify({
            "ret": 0
        }));
    }

}).listen(1999);

const originIsAllowed = (origin)=> {
  // put logic here to detect whether the specified origin is allowed.
  return true;
}

const id2KeyDict = {};
const key2IdDict = {};
const id2ConnDict = {};

wsServer.on('request', function(request) {
    if (!originIsAllowed(request.origin)) {
      // Make sure we only accept requests from an allowed origin
      request.reject();
      console.log((new Date()) + ' Connection from origin ' + request.origin + ' rejected.');
      return;
    }

    let connection;

    try {
        connection = request.accept('echo-protocol', request.origin);       
    } catch (error) {
        console.log(error);
        return;
    }

    console.log((new Date()) + ' Connection accepted.');
    connection.on('message', function(message) {
        if (message.type === 'utf8') {
            // console.log('Received Message: ' + message.utf8Data);
            // try {
                let msgJSON = JSON.parse(message.utf8Data);
                let authKey, targetId = undefined;
                switch(msgJSON.cmd){
                    case "AUTH_VERIFY":
                        authKey = msgJSON.payload.authKey;//decodeURIComponent(msgJSON.payload.authKey);
                        console.log("[AUTH_VERIFY]");
                        console.log(authKey);
                        if(key2IdDict[authKey] !== undefined){
                            let id = key2IdDict[authKey];
                            let response = {};
                            response.cmd = "AUTH_RESPONSE";
                            response.payload = {};
                            response.payload.authKey = authKey;//encodeURIComponent(authKey);
                            response.payload.id = id;
                            id2ConnDict[id] = connection;
                            connection.sendUTF(JSON.stringify(response));
                            break;
                        }
                    case "AUTH_REQUEST":
                        let id = undefined;
                        while (authKey === undefined || id === undefined || id[0] == "0" || key2IdDict[authKey] !== undefined || id2KeyDict[id] !== undefined ){
                            authKey = crypto.randomBytes(64).toString("base64");
                            id = Math.random().toString(10).slice(2,12); // length = 10
                        }
                        key2IdDict[authKey] = id;
                        id2KeyDict[id] = authKey;
                        id2ConnDict[id] = connection;

                        console.log("[AUTH_REQUEST] key2IdDict");
                        console.log(key2IdDict);
                        console.log("[AUTH_REQUEST] id2KeyDict");
                        console.log(id2KeyDict);
                        console.log("[AUTH_REQUEST] id2ConnDict");
                        console.log(Object.keys(id2ConnDict));

                        let response = {};
                        response.cmd = "AUTH_RESPONSE";
                        response.payload = {};
                        response.payload.authKey = authKey;//encodeURIComponent(authKey);
                        response.payload.id = id;
                        connection.sendUTF(JSON.stringify(response));
                        break;
                    case "MSG_SEND":
                        targetId = msgJSON.payload.targetId;
                        console.log("[MSG_SEND] targetId: " + targetId);
                        console.log("id2ConnDict");
                        console.log(Object.keys(id2ConnDict));
                        if (id2ConnDict[targetId] !== undefined){ // found
                            let message = msgJSON;
                            message.cmd = "MSG_INCOMING";
                            // message.payload = {};
                            // message.payload.senderId = msgJSON.payload.senderId;
                            // message.payload.targetId = targetId;
                            // message.payload.message = msgJSON.payload.message;
                            id2ConnDict[targetId].sendUTF(JSON.stringify(message));
                        }else{
                            let message = {};
                            message.cmd = "MSG_INCOMING";
                            message.payload = {};
                            message.payload.senderId = "Server";
                            message.payload.targetId = msgJSON.payload.senderId;
                            message.payload.message = "targetID invalid/offline";
                            connection.sendUTF(JSON.stringify(message));
                        }
                        break;
                    default:
                        // connection.sendUTF(message.utf8Data);
                        break;        
                }
        
            // } catch (error) {
            //     //wsLog(msg, "Server");
            //     console.log("JSON parse error");
            // }
            //connection.sendUTF(message.utf8Data);
        }
        else if (message.type === 'binary') {
            console.log('Received Binary Message of ' + message.binaryData.length + ' bytes');
            //connection.sendBytes(message.binaryData);
        }
    });
    connection.on('close', function(reasonCode, description) {
        console.log((new Date()) + ' Peer ' + connection.remoteAddress + ' disconnected.');
    });
});