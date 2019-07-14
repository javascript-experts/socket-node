'use strict';
/* global $, document, SocketIOFileUpload, io*/
var app = {
    rooms: function () {
        var socket = io('/rooms', {
            transports: ['websocket']
        });
        // When socket connects, get a list of chatrooms
        socket.on('connect', function () {
            // Update rooms list upon emitting updateRoomsList event
            socket.on('updateRoomsList', function (room) {
                // Display an error message upon a user error(i.e. creating a room with an existing title)
                $('.room-create p.message').remove();
                if (room.error != null) {
                    $('.room-create').append(`<p class="message error">${room.error}</p>`);
                } else {
                    app.helpers.updateRoomsList(room);
                }
            });
            // Whenever the user hits the create button, emit createRoom event.
            $('.room-create button').on('click', function (e) {
                var inputEle = $("input[name='title']");
                if (inputEle.val() !== '') {
                    socket.emit('createRoom', inputEle.val());
                    inputEle.val('');
                    $("#compose").modal('hide');
                }
            });
        });
    },
    chat: function (roomId, username) {
        var socket = io('/chatroom', {
            transports: ['websocket']
        });
        // When socket connects, join the current chatroom
        socket.on('connect', function () {

            socket.emit('join', roomId);
            // Update users list upon emitting updateUsersList event
            socket.on('updateUsersList', function (users, clear) {
                $('.container p.message').remove();
                if (users.error != null) {
                    $('.container').html(`<p class="message error">${users.error}</p>`);
                } else {
                    app.helpers.updateUsersList(users, clear);
                }
            });
            // Whenever the user hits the save button, emit newMessage event.
            $('.chat-message button').on('click', function (e) {
                var textareaEle = $("textarea[name='message']");
                if (textareaEle.val() !== '') {
                    var message = {
                        content: textareaEle.val(),
                        username: username,
                        date: Date.now()
                    };
                    socket.emit('newMessage', roomId, message);
                    textareaEle.val('');
                    app.helpers.addMessage(message);
                }
            });
            // Print received message history
            socket.on('history', function (data) {
                var i = data.messages.length || 0;
                var maxlen = i;
                while(i--) {
                    app.helpers.addMessage(data.messages[i], username);
                    if(i == 1){
                        console.log($('.chat-history')[0].scrollHeight);
                        $(".chat-history").animate({
                            scrollTop: $('.chat-history')[0].scrollHeight
                        }, 1000);
                    }
                }
                console.log(maxlen);
                console.log($('.chat-history')[0].scrollHeight*maxlen);
                $(".chat-history").animate({
                    scrollTop: $('.chat-history')[0].scrollHeight*maxlen
                }, 1000);
            });
            // Wheneven a user hits this button,
            // the full room history will be shown in overlay
            $('.history-btn').on('click', function (e) {
                if($('#history-overlay').length === 0){
                    $(document.body).append('<div id="history-overlay"></div>');
                }
                $('#history-overlay').html('<ul></ul>');
                $('#history-overlay').on('click', function(){
                    $(this).remove();
                });
                socket.emit('historyRequest', roomId);
            });
            // Whenever we have history and the overlay exists,
            // show the result from server
            socket.on('historyResponse', function (data) {
                for (var message of data.messages) {
                    app.helpers.addOverlayMessage(message);
                }
            });
            // Whenever a user leaves the current room, remove the user from users list
            socket.on('removeUser', function (userId) {
                $('li#user-' + userId).remove();
                app.helpers.updateNumOfUsers();
            });
            // Append a new message
            socket.on('addMessage', function (message) {
                app.helpers.addMessage(message);
            });

            // Initiate uploader support
            var uploader = new SocketIOFileUpload(socket);
                uploader.listenOnInput(document.getElementById('siofu_input'));
                uploader.addEventListener('start', function(event){
                    event.file.meta.userName = username;
                });
            // Upload started
            socket.on('fileUploadStarted', function () {
                app.helpers.addSystemMessage('fa-spinner fa-spin', 'File upload started');
            });
            // If transfer is not OK, push an error message
            socket.on('fileUploadError', function (message) {
                app.helpers.addSystemMessage('fa-exclamation-triangle', message);
            });
            // Upload just saves
            socket.on('fileUploadSaved', function () {
                app.helpers.addSystemMessage('fa-hand-peace-o', 'File upload successful');
            });
            // Show owner his own message
            socket.on('fileUploadShowToSenser', function (message) {
                app.helpers.addMessage(message);
            });
            // Clean system messages on click
            $('#clientMessages ul').on('click', function(){
                $(this).html('');
            });

        });
    },
    helpers: {
        encodeHTML: function (str) {
            return $('<div />').text(str).html();
        },
        // Update rooms list
        updateRoomsList: function (room) {
            room.title = this.encodeHTML(room.title);
            var html = `<li class="room-container">
                          <a href="#chat1" class="filter direct active" data-chat="open" data-toggle="tab" role="tab" aria-controls="chat1" aria-selected="true" data-chat-id="${room._id}">
                            <div class="status online"><img src="dist/img/avatars/avatar-male-1.jpg" alt="avatar"><i data-eva="radio-button-on"></i></div>
                            <div class="content">
                              <div class="headline">
                                <h5>${room.title}</h5>
                                <span>Today</span>
                              </div>
                            </div>
                          </a>
                        </li>`
            if (html === '') {
                return;
            }
            if ($(".room-list ul li").length > 0) {
                $('.room-list ul').prepend(html);
            } else {
                $('.room-list ul').html('').html(html);
            }
            this.updateNumOfRooms();
        },
        // Update users list
        updateUsersList: function (users, clear) {
            if (users.constructor !== Array) {
                users = [users];
            }
            var html = '';
            for (var user of users) {
                user.username = this.encodeHTML(user.username);
                html +=
                    `<li class="clearfix" id="user-${user._id}">
                     <img src="${user.picture}" alt="${user.username}" />
                     <div class="about">
                        <div class="name">${user.username}</div>
                        <div class="status"><i class="fa fa-circle online"></i> online</div>
                     </div></li>`;
            }
            if (html === '') {
                return;
            }
            if (clear != null && clear == true) {
                $('.users-list ul').html('').html(html);
            } else {
                $('.users-list ul').prepend(html);
            }
            this.updateNumOfUsers();
        },
        // Adding a new message to chat history
        addMessage: function (message, username) {
            message.date = (new Date(message.date)).toLocaleString();
            message.username = this.encodeHTML(message.username);
            message.content = message.noescape === true ? message.content : this.encodeHTML(message.content);
            let senderClass = (username == message.username)? 'sender-message': '';
            if(message.noescape !== true){
            var html =
                 `<li class="${senderClass}">
                  <img src="dist/img/avatars/avatar-male-3.jpg" alt="avatar">
                  <div class="content">
                      <div class="message">
                          <div class="bubble">
                              <p>${message.content}</p>
                              <span>${message.username}</span>
                          </div>
                      </div>
                      <span>${message.date}</span>
                  </div>
              </li>`;
            }else{
            var html =  `<li class="${senderClass}>
                <img src="dist/img/avatars/avatar-male-3.jpg" alt="avatar">
                <div class="content">
                    <div class="message">
                        <div class="bubble">
                            <div class="attachment">
                                <a href="#" class="round"><i data-eva="file-text"></i></a>
                                <div class="meta">
                                    <p>${message.content}</p>
                                    <span>${message.username}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    <span>${message.date}</span>
                </div>
            </li>`;
            }
            $(html).hide().appendTo('.chat-history ul').slideDown(200);
            // Keep scroll bar down
            // $(".chat-history").animate({
            //     scrollTop: $('.chat-history')[0].scrollHeight
            // }, 1000);
        },
        // Adding a new message to chat history in the overlay
        addOverlayMessage: function (message) {
            message.date = (new Date(message.date)).toLocaleString();
            message.username = this.encodeHTML(message.username);
            message.content = message.noescape === true ? message.content : this.encodeHTML(message.content);
            var html =
                `<li>
                    <div class="message-data">
                      <span class="message-data-name">${message.username}</span>
                      <span class="message-data-time">${message.date}</span>
                    </div>
                    <div class="message my-message" dir="auto">${message.content}</div>
                  </li>`;
            $(html).hide().appendTo('#history-overlay ul').slideDown(200);
            // Keep scroll bar down
            $("#history-overlay").animate({
                scrollTop: $('#history-overlay')[0].scrollHeight
            }, 1000);
        },
        // Adding a new system message
        addSystemMessage: function (icon, messageText) {
            $('#clientMessages ul').html('');
            var html =
                `<li>
                    <i class="fa-li fa ${icon}"></i>${messageText}
                </li>`;
            $('#clientMessages ul').append(html);
            setTimeout(function(){$('#clientMessages ul').html('');}, 5000);
        },
        // Update number of rooms
        // This method MUST be called after adding a new room
        updateNumOfRooms: function () {
            var num = $('.room-list ul li').length;
            $('.room-num-rooms').text(num + " Room(s)");
        },
        // Update number of online users in the current room
        // This method MUST be called after adding, or removing list element(s)
        updateNumOfUsers: function () {
            var num = $('.users-list ul li').length;
            $('.chat-num-users').text(num + " User(s)");
        }
    }
};
