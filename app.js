var WebSocketServer = require('ws').Server;
var wss = new WebSocketServer({ port: 8081 });

//Session status:
//sfu:setting things up
//p1t:player one turn
//p2t:player two turn
//p1w:player one win
//p2w:player two win
var sessions = [];

wss.on('connection', function connection(ws) {
    Message(ws, wss);
    ws.send(JSON.stringify({ name: "Server", text: "I am alive!", systemMessage: "" }));
    ws.on('close', function () {
        var cmd = {};
        Reset(cmd, ws);
    });
});

var Reset = function (cmd, ws) {
    if (!cmd.type && ws.currentSession) {
        cmd.type = "sch";
        cmd.status = "p" + (ws.pIndex == 0 ? 1 : 2) + "l";
        for (var index = 0; index < ws.currentSession.clients.length; index++)
            SendToClient(ws.currentSession.clients[index].clientID, cmd);
    }
    if (ws.currentSession && ws.currentSession.status != "sfu") {
        var sessionsIndex = sessions.indexOf(ws.currentSession);
        var clients = ws.currentSession.clients;
        for (var index = 0; index < clients.length; index++)
            clients[index].currentSession = null;

        sessions.splice(sessionsIndex, 1);
    }
}

wss.broadcast = function broadcast(data, ignoreOriginal) {
    var request = JSON.parse(data);
    wss.clients.forEach(function each(client) {
        if (!ignoreOriginal || (ignoreOriginal && client.clientID && request.clientID != client.clientID))
            client.send(data);
    });
};

function LoadSessions(cmd) {
    cmd.sessions = [];
    for (var index = 0; index < sessions.length; index++) {
        var ss = sessions[index];
        if (ss.clients.length <= 1)
            cmd.sessions[cmd.sessions.length] = { id: ss.id, name: ss.name };
    }
}

function FindSession(id) {
    for (var index = 0; index < sessions.length; index++) {
        var ss = sessions[index];
        if (ss.id == id)
            return ss;
    }
}

function FindClient(clientID) {
    for (var index = 0; index < wss.clients.length; index++) {
        if (wss.clients[index].clientID == clientID)
            return wss.clients[index];
    }
}

function SendToClient(clientID, cmd) {
    var client = FindClient(clientID);
    if (client) {
        client.send(JSON.stringify(cmd));
        console.log('sent: %s', JSON.stringify(cmd));
        return;
    }
}

String.prototype.insert = function (index, string) {
    if (index > 0)
        return this.substring(0, index) + string + this.substring(index, this.length);
    else
        return string + this;
};

String.prototype.remove = function (start, length) {
    if (start >= 0)
        return this.substring(0, start) + this.substring(start + length, this.length);
    else
        return this;
};

function updateBoard(move, currentSession) {
    currentSession.board = currentSession.board ? currentSession.board : "";
    var x = 0, y = 0;

    var defaulTile = String.fromCharCode(parseInt("01000000", 2));
    for (var i = 0; i < 112; i++) {
        if (i > 0 && i % 8 == 0) {
            x = 0;
            y++;
        }

        if (currentSession.board.length == i)
            currentSession.board += defaulTile;

        if (move.newPos.x == x && parseInt(move.newPos.y, 16) == y) {
            if (pad(currentSession.board[i].charCodeAt(0).toString(2), 8, "0").substring(5) == "111")
                currentSession.itsOver = true;

            if (currentSession.status != "sfu" || currentSession.board[i] != move.tile)
                currentSession.board = currentSession.board.insert(i, move.tile).remove(i + 1, 1);
            else
                currentSession.board = currentSession.board.insert(i, defaulTile).remove(i + 1, 1);
        }

        if (move.oldPos) {
            if (move.oldPos.x == x && parseInt(move.oldPos.y, 16) == y)
                currentSession.board = currentSession.board.insert(i, defaulTile).remove(i + 1, 1);
        }
        //board = board.Insert((x * 8) + (y * 14), char.Parse(Convert.ToInt32("011" + pNumber + hidden + animalType, 2).ToString()).ToString()).Remove(((x * 8) + (y * 14)) + 1);
        //string newPos = move.Split(';')[1];
        //string oldPos = !string.IsNullOrEmpty(move.Split(';')[2]) ? move.Split(';')[2] : "";
        x++;
    }

    return currentSession.board;
}

function pad(n, width, z) {
    z = z || '0';
    n = n + '';
    return n.length >= width ? n : new Array(width - n.length + 1).join(z) + n;
}

var Message = function (ws, wss) {
    ws.on('message', function incoming(command) {
        console.log('received: %s', command);
        var cmd = JSON.parse(command);
        if (cmd.type == "fst") {
            ws.clientID = cmd.clientID;
            ws.clientName = cmd.pName;
        }
        if (cmd.type == "lst") {
            LoadSessions(cmd);
            ws.send(JSON.stringify(cmd));
        }

        if (cmd.type == "cse") {
            var sessionID = Math.round(Math.random() * 1000000000000);
            sessions[sessions.length] = {
                id: sessionID,
                name: cmd.msg,
                clients: [{ clientID: ws.clientID, clientName: ws.clientName }],
                status: "sfu"
            }

            ws.currentSession = sessions[sessions.length - 1];

            cmd.sessionID = sessionID;
            cmd.type = "sct";
            ws.send(JSON.stringify(cmd));
            ws.pIndex = 0;
        }

        if (cmd.type == "cht") {
            wss.broadcast(JSON.stringify(cmd));
        }

        if (cmd.type == "jss") {
            ws.currentSession = FindSession(cmd.msg);
            if (ws.currentSession && ws.currentSession.clients.length <= 1) {
                ws.currentSession.clients[ws.currentSession.clients.length] = { clientID: ws.clientID, clientName: ws.clientName };
                cmd.type = "sjn";
                cmd.sessionID = ws.currentSession.id;
                cmd.opponentName = ws.currentSession.clients[0].clientName;
                ws.currentSession.status = "sfu";
                ws.send(JSON.stringify(cmd));
                cmd.type = "och";
                cmd.opponentName = ws.clientName;
                ws.pIndex = 1;
                SendToClient(ws.currentSession.clients[0].clientID, cmd);
            }
            else {
                ws.send(JSON.stringify({ systemMessage: "Session has already started." }));
            }
        }

        if (cmd.type == "mov") {
            cmd.board = updateBoard(cmd.move, ws.currentSession);
            cmd.type = "ubd";
            for (var index = 0; index < ws.currentSession.clients.length; index++)
                SendToClient(ws.currentSession.clients[index].clientID, cmd);

            if (ws.currentSession.status != "sfu") {
                cmd.type = "sch";
                if (ws.currentSession.itsOver) {
                    ws.currentSession.status = "p" + (ws.pIndex == 0 ? 1 : 2) + "w";
                }
                else
                    ws.currentSession.status = "p" + (ws.pIndex == 0 ? 2 : 1) + "t";

                cmd.status = ws.currentSession.status;
                for (var index = 0; index < ws.currentSession.clients.length; index++)
                    SendToClient(ws.currentSession.clients[index].clientID, cmd);

                if (ws.currentSession.itsOver)
                    Reset({ type: "ovr" }, ws);
            }
        }

        if (cmd.type == "suc") {
            ws.currentSession.clients[ws.pIndex].ready = true;
            if (ws.currentSession.clients[0].ready && ws.currentSession.clients[1] && ws.currentSession.clients[1].ready) {
                cmd.type = "sch";
                cmd.status = Math.ceil(Math.random() * 10) >= 5 ? "p1t" : "p2t";
                ws.currentSession.status = cmd.status;
                for (var index = 0; index < ws.currentSession.clients.length; index++)
                    SendToClient(ws.currentSession.clients[index].clientID, cmd);
            }
        }

        if (cmd.type == "rst")
            Reset(cmd, ws);

        if (cmd.type == "falling") {
            if (!ws.clientID) {
                ws.clientID = cmd.clientID;
                ws.clientName = cmd.pName;
                return;
            }
            
            wss.broadcast(JSON.stringify(cmd), true);
        }
    });
};