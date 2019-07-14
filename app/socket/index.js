'use strict';

var config     = require('../config');
var redis      = require('redis').createClient;
var adapter    = require('socket.io-redis');
var Room       = require('../models/room');
var Message    = require('../models/message');

const fs        = require('fs');
const path      = require('path');
var siofu       = require('../filetransfer');
const readChunk = require('read-chunk');
const fileType  = require('file-type');
const imgTypes  = ['jpg', 'png', 'gif'];

var fsUploadsDir = fs.realpathSync(__dirname + '/../../public/' + config.uploadsDir);
var webUploasDir = '/' + config.uploadsDir;

/**
 * Encapsulates all code for emitting and listening to socket events
 *
 */
var ioEvents = function (io) {
    // Rooms namespace
    io.of('/rooms').on('connection', function (socket) {
        // Create a new room
        socket.on('createRoom', function (title) {
            Room.findOne({
                'title': new RegExp('^' + title + '$', 'i')
            }, function (err, room) {
                if (err) throw err;
                if (room) {
                    socket.emit('updateRoomsList', {
                        error: 'Room title already exists.'
                    });
                } else {
                    Room.create({
                        title: title
                    }, function (err, newRoom) {
                        if (err) throw err;
                        socket.emit('updateRoomsList', newRoom);
                        socket.broadcast.emit('updateRoomsList', newRoom);
                    });
                }
            });
        });
    });
    // Chatroom namespace
    io.of('/chatroom').on('connection', function (socket) {

        // Join a chatroom
        socket.on('join', function (roomId) {

            // Lookup and create dir for uplaods
            var dir     = fsUploadsDir + '/' + roomId,
                webDir  = webUploasDir + '/' + roomId ;
            if (!fs.existsSync(dir)){
                fs.mkdirSync(dir);
            }

            // Listen for file tranmsfers
            var uploader = new siofu();
                uploader.dir = dir ;
                uploader.listen(socket);

            // Uploader events
            // Start triggers spinner on client
            uploader.on('start', function(event){
                socket.emit('fileUploadStarted');
            });
            // If transfer OK, auto create and push a message and hide spinner
            uploader.on('saved', function(event){
                if(event.file.success){
                    // Auto create a message with a picture or download url
                    var buffer   = readChunk.sync(event.file.pathName, 0, 262);
                    var filetype = fileType(buffer);
                    if(filetype && filetype.ext) {
                        // Confirm file upload is OK
                        socket.emit('fileUploadSaved');
                        // Create a download link or image
                        var uploadedName = path.basename(event.file.pathName);
                        var content = '';
                        if(imgTypes.indexOf(filetype.ext) >= 0){
                            content = `<img src="${webDir}/${uploadedName}">`;
                        }
                        else {
                            content = `<a href="${webDir}/${uploadedName}" target="_blank">${event.file.name}</a>`;
                        }
                        // Now create the message, set noescape to prevent client escaping generated html
                        var message = {date : Date.now(), username : event.file.meta.userName, content : content, noescape : true};
                        // Push it back to the user
                        socket.emit('fileUploadShowToSenser', message);
                        // Broadcast to all
                        socket.broadcast.to(roomId).emit('addMessage', message);
                        // Save the message to database for history asynchronously
                        Message.create({roomId: roomId, userId : socket.request.session.passport.user, username: message.username, date: message.date, content: message.content, noescape : true });
                    }
                    else {
                        socket.emit('fileUploadError', 'File type is not supported');
                    }
                }
                else {
                    socket.emit('fileUploadError', 'File upload error 2');
                }
            });
            // If transfer is not OK, push an error message
            uploader.on('error', function(event){
                socket.emit('fileUploadError', 'File upload error 1');
            });

            Room.findById(roomId, function (err, room) {
                if (err) throw err;
                if (!room) {
                    // Assuming that you already checked in router that chatroom exists
                    // Then, if a room doesn't exist here, return an error to inform the client-side.
                    socket.emit('updateUsersList', {
                        error: 'Room doesnt exist.'
                    });
                } else {
                    // Check if user exists in the session
                    if (socket.request.session.passport == null) {
                        return;
                    }

                    // Push the recent room history,
                    // con be well configurable at the second parameter
                    Message.getMessageHistory(roomId, {sort: {date: -1}, limit : config.defaultHistoryMessagesLimit}, function(err, data){
                        socket.emit('history', {messages : data});
                    });

                    // Add user to room now
                    Room.addUser(room, socket, function (err, newRoom) {
                        // Join the room channel
                        socket.join(newRoom.id);
                        Room.getUsers(newRoom, socket, function (err, users, cuntUserInRoom) {
                            if (err) throw err;
                            // Return list of all user connected to the room to the current user
                            socket.emit('updateUsersList', users, true);
                            // Return the current user to other connecting sockets in the room
                            // ONLY if the user wasn't connected already to the current room
                            if (cuntUserInRoom === 1) {
                                socket.broadcast.to(newRoom.id).emit('updateUsersList', users[users.length - 1]);
                            }
                        });
                    });
                }
            });
        });
        // When a socket exits
        socket.on('disconnect', function () {
            // Check if user exists in the session
            if (socket.request.session.passport == null) {
                return;
            }
            // Find the room to which the socket is connected to,
            // and remove the current user + socket from this room
            Room.removeUser(socket, function (err, room, userId, cuntUserInRoom) {
                if (err) throw err;
                // Leave the room channel
                socket.leave(room.id);
                // Return the user id ONLY if the user was connected to the current room using one socket
                // The user id will be then used to remove the user from users list on chatroom page
                if (cuntUserInRoom === 1) {
                    socket.broadcast.to(room.id).emit('removeUser', userId);
                }
            });
        });
        // When a new message arrives
        socket.on('newMessage', function (roomId, message) {
            // No need to emit 'addMessage' to the current socket
            // As the new message will be added manually in 'main.js' file
            socket.broadcast.to(roomId).emit('addMessage', message);
            // save message to database for history asynchronously
            Message.create({roomId: roomId, userId : socket.request.session.passport.user, username: message.username, date: message.date, content: message.content });
        });
        // When user wants to see the full room history
        socket.on('historyRequest', function (roomId) {
            Message.getMessageHistory(roomId, {}, function(err, data){
                socket.emit('historyResponse', {messages:data});
            });
        });
    });
};
/**
 * Initialize Socket.io
 * Uses Redis as Adapter for Socket.io
 *
 */
var init = function (app) {
    var server = require('http').Server(app);
    var io = require('socket.io')(server);
    // Force Socket.io to ONLY use "websockets"; No Long Polling.
    io.set('transports', ['websocket']);
    // Using Redis
    let port = config.redis.port;
    let host = config.redis.host;
    let password = config.redis.password;
    let pubClient = redis(port, host, {
        auth_pass: password
    });
    let subClient = redis(port, host, {
        auth_pass: password,
        return_buffers: true,
    });
    io.adapter(adapter({
        pubClient,
        subClient
    }));
    // Allow sockets to access session data
    io.use((socket, next) => {
        require('../session')(socket.request, {}, next);
    });
    // Define all Events
    ioEvents(io);
    // The server object will be then used to list to a port number
    return server;
};
module.exports = init;
