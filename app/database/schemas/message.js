'use strict';
var Mongoose      = require('mongoose');
var MessageSchema = new Mongoose.Schema({
    roomId: {
        type: Mongoose.Schema.Types.ObjectId,
        required: true
    },
    userId: {
        type: Mongoose.Schema.Types.ObjectId,
        required: true
    },
    username: {
        type: String,
        required: true
    },
    date: {
        type: Number,
        required: true
    },
    content: {
        type: String,
        required: true
    },
    noescape: {
        type: Boolean,
        required: false
    }
});
var messageModel = Mongoose.model('message', MessageSchema);
module.exports = messageModel;
