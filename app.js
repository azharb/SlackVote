'use strict';

/*
 * Express Dependencies
 */
var express = require('express');
var app = express();
var port = 3000;

/*
 * Mongo DB
 */
var mongo = require('mongodb');
var monk = require('monk');
var mongoUri = process.env.MONGOLAB_URI || 
  process.env.MONGOHQ_URL || 
  'localhost:27017/VoteDB'; 

var db = monk(mongoUri);

/*
 * Slack configuration
 */
var Slack = require('slack-node');
var webhookUri = 'https://hooks.slack.com/services/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';
var appAccessToken = 'xoxp-2205935508-2209690286-3832470983-f50ac2';

// For gzip compression
app.use(express.compress());


// Make our db accessible to our router
app.use(function(req,res,next){
    req.db = db;
    next();
});

// Configure app
app.configure(function(){
  app.use(express.bodyParser());
  app.use(app.router);
});


/*
 * Routes
 */
// Index Page
app.get('/', function(request, response, next) {
    response.render('index');
});

// Outgoing webhooks from Slack
app.post('/outgoing', function(req, res, next) {
    var votes = req.db.get('votes');

    var trigger_word = req.body.trigger_word;

    // config for slack api call
    var slack = new Slack(appAccessToken);
    var channelID = req.body.channel_id;

    // Trigger is to start vote
    if (trigger_word == 'startvote') {
        
        //get all members in channel
        slack.api("channels.info", { 'channel' : channelID}, function(err, response) {
            
            //expect their responses 
            response.channel.members.forEach(function(m) {
                votes.update(
                    { 'userID' : m, 'channelID' : channelID },
                    { 'userID' : m, 'username': '', 'channelID' : channelID, 'status' : 0, 'vote': ''},
                    { upsert: true },
                    function (err, doc) {
                        if (err) throw err;
                        console.log(doc);
                    }
                );
            });
            
        });

        //respond asking for votes from everyone
        res.json({text: 'everyone reply with "/vote <youranswer>"'});

    } else if (trigger_word == 'reveal') {

        var returnText = 'Votes:\n';

        // get channel members
        slack.api('channels.info', { 'channel' : channelID }, function(err, response) {
            
            var params = { userID : { $in : response.channel.members }, status : 1 };
            
            votes.find(
                params,
                function(err, results){
                    if (err) throw err;
                    
                    if (results.length > 0) {
                        results.forEach(function(r) {
                            returnText += r.username + " votes " + r.vote + "\n";
                        });
                        res.json({ text: returnText });
                    } else {
                        res.json({ text : "No votes found." });
                    }
                }
            );    
        });     
    } else {
        res.json({ text : 'Unknown trigger' });
    }
    
});

// Slack command - vote from a user
app.post('/vote', function(req, res, next) {
    var votes = req.db.get('votes');
    var input = req.body;

    votes.update(
        { userID : input.user_id, status : 0 },
        { $set: { status : 1, vote : input.text, username : input.user_name }},
        function(err, doc) {
            console.log(err);
            console.log(doc);
            if (err) {
                res.json('Something went wrong. Your vote was not recorded.');
            } else {
                res.json('Your vote has been recorded.');
            }
        }
    );
});


/*
 * Start it up
 */
app.listen(process.env.PORT || port);
console.log('Express started on port ' + port);