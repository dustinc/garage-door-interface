

const express = require('express');
const app = express();
const server = require('http').Server(app);

const { MongoClient, ObjectId } = require('mongodb');

const _ = require('underscore');
const path = require('path');

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const socketioJwt = require('socketio-jwt');
const bodyParser = require('body-parser');

const events = require('events');
const em = new events.EventEmitter();


let client = null;
let db = null;

global.Promise = require('bluebird');

const mongoConnect = async () => {
  if (client && db) return Promise.resolve(db);
  try {
    client = await MongoClient.connect(process.env.MONGODB_URI, { useNewUrlParser: true });
    if (!client) {
      return Promise.reject('Unable to connect to MongoDB');
    }
    db = client.db();
    return Promise.resolve(db);
  }
  catch (err) {
    return Promise.reject(err);
  }
};


// Redis

const redis = require('redis');

Promise.promisifyAll(redis.RedisClient.prototype);
Promise.promisifyAll(redis.Multi.prototype);

const sub = redis.createClient(process.env.REDISCLOUD_URL);
const pub = redis.createClient(process.env.REDISCLOUD_URL);


sub.on('message', (channel, message) => {
  console.log(channel, message);
  if ('door_status' === channel) {
    em.emit('door', message);
  }
});

sub.subscribe('door_status');


// Socket IO

const io = require('socket.io')(server);

io.on('connect', socketioJwt.authorize({
  secret: process.env.JWT_ACCESS_SECRET,
  timeout: 10000,
  additional_auth: async (decoded, onSuccess, onError) => {
    try {
      const q = { _id: ObjectId.createFromHexString(decoded.user_id) };
      const o = { projection: { password: 0 } };
      const user = await db.collection('users').findOne(q, o);
      if (!user) return onError(new Error('Failure!'));
      onSuccess();
    }
    catch (err) {
      onError(err);
    }
  }
})).on('authenticated', function(socket) {

  this.doorListener = (ds) => {
    this.emit('door status', ds);
  }

  em.on('door', this.doorListener);

  socket.on('trigger door', () => {
    pub.publish('command', 'TRIGGERDOOR');
    socket.emit('door triggered', 'Triggered...');
  });

  socket.on('disconnect', () => {
    em.removeListener('door', this.doorListener);
  });

});


// Config Stuff

app
  .set('views', path.normalize(`${__dirname}/views`))
  .set('view engine', 'pug');


// MW

app.use(async (req, res, next) => {
  if (db) return next();
  try {
    await mongoConnect();
    return next();
  }
  catch (err) {
    return next(err);
  }
});


// Routes

app.get('/', async (req, res, next) => {
  let h = `${req.protocol}://${req.hostname}:${process.env.PORT}`;
  let door_status = await pub.getAsync('door-status');
  res.render('index', { door_status, h });
});

const urlencodedParser = bodyParser.urlencoded({ extended: false });

app.post('/signin', urlencodedParser, async (req, res, next) => {
  console.log('req.body', req.body);
  let name = req.body.name;
  try {
    const user = await db.collection('users').findOne({ name });
    if (!user) return next(new Error('Failure!'));
    const pass = await bcrypt.compare(req.body.pw, user.password);
    if (!pass) return next(new Error('Failure!'));
    const token = jwt.sign(
      { user_id: user._id },
      process.env.JWT_ACCESS_SECRET,
      { expiresIn: '365d' }
    );
    return res.json({ token });
  }
  catch (e) {
    return next(e);
  }
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



server.listen(process.env.PORT, async () => {
  console.log('Stormcloud Garage Door listening on', process.env.PORT, process.env.NODE_ENV);
});
