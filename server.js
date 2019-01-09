
const express = require('express');
const app = express();
const server = require('http').Server(app);

const bluebird = require('bluebird');
const _ = require('underscore');
const path = require('path');

const events = require('events');
const em = new events.EventEmitter();

let DOOR_STATUS = 'UNKNOWN';

// Redis

const redis = require('redis');

bluebird.promisifyAll(redis.RedisClient.prototype);
bluebird.promisifyAll(redis.Multi.prototype);

const sub = redis.createClient(process.env.REDISCLOUD_URL);
const pub = redis.createClient(process.env.REDISCLOUD_URL);


sub.on('message', (channel, message) => {
  console.log(channel, message);
  if ('door_status' === channel) {
    DOOR_STATUS = message;
    em.emit('door', DOOR_STATUS);
  }
});

sub.subscribe('door_status');


// Socket IO

const io = require('socket.io')(server);

//em.on('door', (ds) => io.emit('door', ds));

io.on('connect', function(socket) {

  this.doorListener = (ds) => {
    console.log('socket door listener...', ds);
    this.emit('door status', ds);
  }

  em.on('door', this.doorListener);

  this.on('disconnect', () => {
    em.removeListener('door', this.doorListener);
  });

});


// Config Stuff

app
  .set('views', path.normalize(__dirname + '/views'))
  .set('view engine', 'pug');


// Routes

app.get('/', async (req, res, next) => {
  // Load html page that shows door status
  // and a button to trigger the garage door
  // and a button to refresh the door status.
  //pub.publish('command', 'GETSTATUS');
  let door_status = await pub.getAsync('door-status');
  res.render('index', { door_status });
});

app.post('/trigger-door', (req, res, next) => {
  pub.publish('command', 'TRIGGERDOOR');
  res.send('Triggering door...');
});


// Catch-all Route Error Handler

app.use((err, req, res, next) => {
  console.error(err);
  let message = err.message;
  if (err.errors) {
    message += ' ' + err.errors.map(e => e.message).join(' ');
  }
  res.status(res.statusCode==200?(err.status?err.status:500):res.statusCode);
  return res.json(_.defaults({ message: message }, err, {
    message: message,
    type: err.type,
    name: err.name,
    code: err.code,
    status: res.statusCode
  }));
});




server.listen(process.env.PORT, () => {
  console.log('Stormcloud Garage Door listening on', process.env.PORT, process.env.NODE_ENV);
});
