var manager = require('./manager');

var app = new manager.App(process.argv[2]);
var server = new manager.Server(app, process.argv[3], process.argv[4], process.argv[5]);
var m = new manager.Manager();
m.start();
m.addServer(server);
process.send("server started!");
