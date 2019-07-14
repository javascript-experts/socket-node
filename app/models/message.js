'use strict';

var messageModel = require('../database').models.message;
var User         = require('../models/user');
var Room         = require('../models/room');

var create = function (data, callback){
	var newMessage = new messageModel(data);
	newMessage.save(callback);
};

var find = function (data, callback){
	messageModel.find(data, callback);
};

var findOne = function (data, callback){
	messageModel.findOne(data, callback);
};

var findById = function (id, callback){
	messageModel.findById(id, callback);
};

var findByIdAndUpdate = function(id, data, callback){
	messageModel.findByIdAndUpdate(id, data, { 'new': true }, callback);
};

/**
 * Get messages history
 *
 */
var getMessageHistory = function(roomId, options, callback){
	messageModel.find({roomId : roomId}, null, options, function(err, docs){
		if (err) { return callback(err); }
		return callback(null, docs);
	});
};

module.exports = {
	create,
	find,
	findOne,
	findById,
	getMessageHistory
};
