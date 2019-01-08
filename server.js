
const express = require('express');
const app = express();
const server = require('http').Server(app);



// Redis

const redis = require('redis');
const client = redis.createClient(process.env.REDISCLOUD_URL);


// Routes

app.get('/', function(req, res) {
  res.send('Stormcloud Garage Door');
});




// Catch-all Route Error Handler

app.use(function(err, req, res, next) {
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




server.listen(process.env.PORT, async function() {
  console.log('Stormcloud Garage Door listening on', process.env.PORT, process.env.NODE_ENV);
});
