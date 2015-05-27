var cluster = require('cluster')
        , util = require('util')
        , host = require('./host')
        , nssocket = require('nssocket')
        , http = require('http')
        , clc = require('cli-color')
        , App = require('./app')
        , Server = require('./server')
        , debug = require('debug')('manager')
        , EventEmitter = require('events').EventEmitter;

var error = clc.red.bold;
var warn = clc.yellow;
var notice = clc.blue.bold;

function sendCommand(workers, command, callback) {
    Object.keys(workers).forEach(function (id) {
        workers[id].once('message', function (data) {
            if (typeof callback == 'function') {
                callback(data);
            }
        });
        workers[id].send(command);
    });
}

var Manager = function () {
    EventEmitter.call(this);

    this._sock = null;
    this._socket = null;
    this._servers = [];
    this._domains = {};
    this._ports = {};
};

util.inherits(Manager, EventEmitter);
exports = module.exports = Manager;

Manager.prototype.start = function (cb) {
    if (!cluster.isMaster) {
        return cb(null);
    }
    var self = this;
    this._socket = nssocket.createServer(function (socket) {
        socket.data(['host', 'add'], function (data) {
            try {
                var params = JSON.parse(data);
                var appPath = params[0];
                var options = params[1];
                var app = new App(appPath);
                var server = new Server(app, options);
                self.addServer(server, function (err, msg) {
                    socket.send(['host', 'status'], JSON.stringify([err, msg]));
                });
            } catch (e) {
                socket.send(['host', 'status'], JSON.stringify([e.stack || e.message, null]));
            }
        });
        socket.data(['host', 'remove'], function (data) {

        });
        socket.data(['host', 'list'], function (data) {
            socket.send(['host', 'status'], JSON.stringify([undefined, self._servers.map(function (s) {
                    return {
                        scriptPath: s.app.appPath,
                        domain: s.domain,
                        port: s.port,
                        startDate: s.startDate
                    };
                })]));
        });
    });
    this._sock = host.config.sockFile;
    this._socket.listen(this._sock);
    this._socket.on('error', function (e) {
        cb(e);
    });
    this._socket.on('listening', function () {
        cb(null);
    });
};

Manager.prototype.addServer = function (server, cb) {
    var self = this;
    if (Array.isArray(this._domains[server.domain])) {
        if (!this._domains[server.domain].every(function (s) {
            if (s.port == server.port) {
                cb(util.format("Domain %s with port %d already exists!", server.domain, server.port));
                return false;
            }
            return true;
        })) {
            return;
        }
    }

    this._servers.push(server);
    if (!this._domains[server.domain]) {
        this._domains[server.domain] = [];
    }
    this._domains[server.domain].push(server);

    if (!this._ports["" + server.port]) {
        this._ports["" + server.port] = [server];
        if (cluster.isMaster) {
            var cpus = server.cluster || 0;
            if (cpus == 0) {
                cpus = require('os').cpus().length;
            }
            var workers = [];
            for (var i = 0; i < cpus; ++i) {
                workers.push(cluster.fork({
                    NODE_ENV: "production"
                }));
            }
            var successCount = 0;
            var failCount = 0;
            cluster.on('exit', function (worker, code, signal) {
                ++failCount;
                if (successCount + failCount == cpus) {
                    if (successCount) {
                        server.startDate = new Date();
                        cb(null, util.format("Server %s:%d started with %d success and %d failure cluster", server.domain, server.port, successCount, failCount));
                    } else {
                        cb("Fail");
                    }
                }
                debug(warn('worker ' + worker.process.pid + ' exited with code: ' + code));
            });
            cluster.on('listening', function (worker, address) {
                ++successCount;
                if (successCount + failCount == cpus) {
                    if (successCount) {
                        server.startDate = new Date();
                        cb(null, util.format("Server %s:%d started with %d success and %d failure cluster", server.domain, server.port, successCount, failCount));
                    } else {
                        cb("Fail");
                    }
                }
                debug("Worker %d is now connected to %s:%d", worker.id, address.address, address.port);
            });
            sendCommand(workers, {
                cmd: 'startServer',
                params: [server.app.appPath, server.domain, server.port, server.cluster]
            });
        } else {
            var httpServer = http.createServer(function (req, res) {
                var domain = req.domain || req.headers.host.split(':')[0];
                var port = req.headers.host.split(':')[1] || "80";
                var debug = require('debug')('Request');
                debug(warn("Worker: %d on %s:%d"), cluster.worker.id, domain, port);
                var refer = req.headers.refer;
                var servers = ((self._domains[domain] || []).length < (self._ports[port] || []).length ? self._domains[domain] : self._ports[port]) || [];
                if (servers.every(function (s) {
                    if (s.domain == domain && s.port == port) {
                        try {
                            s.app.handler(req, res);
                        } catch (e) {
                            console.error(e);
                            res.writeHead(e.status || 500, {
                                'Content-Type': 'text/html'
                            });
                            res.end("<pre>" + (e.stack || e.message) + "</pre>");
                        }
                        return false;
                    }
                    return true;
                })) {
                    res.writeHead(200, {
                        'Content-Type': 'text/html'
                    });
                    res.end("<h1>No app binded to this domain!</h1>");
                }
            });
            httpServer.listen(server.port, server.domain);
            httpServer.on('error', function (e) {
                console.error(e);
                cb(e);
            });
            httpServer.on('listening', function () {
                debug(notice("Listening on %d"), server.port);
                cb(null, util.format("Server %s:%d added to worker: %d", server.domain, server.port, cluster.worker.id));
            });
            server._server = httpServer;
            server.startDate = new Date();
        }
    } else {
        this._ports["" + server.port].push(server);
        server.startDate = new Date();

        if (cluster.isMaster) {
            // find who is listening on current server port
            sendCommand(cluster.workers, {
                cmd: 'getPort'
            }, function (data) {
                if (data.port == server.port) {
                    cluster.workers[data.id].send({
                        cmd: 'addServer',
                        params: [server.app.appPath, server.domain, server.port, server.cluster]
                    });
                }
            });
            cb(null, util.format("Server %s:%d added!", server.domain, server.port));
        } else {
            cb(null, util.format("Server %s:%d added to worker: %d", server.domain, server.port, cluster.worker.id));
        }
    }
};

Manager.prototype.removeServer = function (server) {

};

Manager.prototype.findByDomain = function (domain) {

};

Manager.prototype.findByIndex = function (index) {

};
