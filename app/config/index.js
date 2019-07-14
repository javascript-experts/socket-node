'user strict';
var init = function() {
    if (process.env.NODE_ENV === 'production') {
		console.log('process.env.REDIS_URL------- '+process.env.REDIS_URL);
		console.log('process.env.MONGODB_URI------- '+process.env.MONGODB_URI);
        var redisURI = require('url').parse(process.env.REDIS_URL);
        var redisPassword = redisURI.auth.split(':')[1];
        return {
            dbURI: process.env.MONGODB_URI || 'mongodb://localhost:27017/chat',
            sessionSecret: 'test secret',
			"uploadsDir": "uploads",
            facebook: {
                clientID: process.env.facebookClientID,
                clientSecret: process.env.facebookClientSecret,
                callbackURL: "/auth/facebook/callback",
                profileFields: ['id', 'displayName', 'photos']
            },
            twitter: {
                consumerKey: process.env.twitterConsumerKey,
                consumerSecret: process.env.twitterConsumerSecret,
                callbackURL: "/auth/twitter/callback",
                profileFields: ['id', 'displayName', 'photos']
            },
            redis: {
                host: redisURI.hostname,
                port: redisURI.port,
                password: redisPassword
            }
        }
    } else {
        return require('./config.json');
    }
}
module.exports = init();
