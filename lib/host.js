var nssocket = require('nssocket')
        , mkdirp = require('mkdirp')
        , cluster = require('cluster')
        , clc = require('cli-color')
        , debug = require('debug')('Manager')
        , EventEmitter = require('events').EventEmitter
        , fs = require('fs')
        , url = require('url')
        , http = require('http')
        , path = require('path')
        , util = require('util');

var error = clc.red.bold;
var warn = clc.yellow;
var notice = clc.blue.bold;

var managerStarted;

function sockFile() {
    var sockdir = path.join(process.env.HOME || "~", ".nhost", "sock");
    mkdirp.sync(sockdir);
    return path.join(sockdir, "run.sock");
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

exports.error = function () {
    console.error(error(util.format.apply(this, arguments)));
};

exports.notice = function () {
    console.log(notice(util.format.apply(this, arguments)));
};

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
    this._sock = sockFile();
    this._socket.listen(this._sock);
    this._socket.on('error', function (e) {
        cb(e);
    });
    this._socket.on('listening', function () {
        cb(null);
    });
};

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
            /*
             function msgHandler(data) {
             console.log(data);
             }
             Object.keys(cluster.workers).forEach(function (id) {
             cluster.workers[id].on('message', msgHandler);
             cluster.workers[id].send({
             cmd: 'startServer',
             params: [server.app.appPath, server.domain, server.port, server.cluster]
             });
             });
             */
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

exports.Manager = module.exports.Manager = Manager;

var Server = function (app, domain, port, cluster) {
    this.app = app;
    if (typeof domain == 'object') {
        this.domain = domain.domain.trim();
        this.cluster = parseInt(domain.cluster);
        this.port = parseInt(domain.port) || 80;
    } else {
        this.domain = domain.trim();
        this.cluster = parseInt(cluster) || 0;
        this.port = parseInt(port) || 80;
    }
    this.path = "/";
};

exports.Server = module.exports.Server = Server;

var App = exports.App = module.exports.App = function (execPath) {
    this.appPath = execPath;
    this.fullPath = path.join(process.cwd(), execPath);
    this.handler = require(this.fullPath);
    if (typeof this.handler !== 'function') {
        throw new Error("Not a valid app! the main entry must export a function with signuture function(req, res)");
    }
};

exports.start = function (fullpath, options) {
    function createWorker() {
        var worker = require('child_process').spawn(process.execPath, [path.join(__dirname, "worker.js")], {
            stdio: ['ipc', 1, 2],
            detached: true
        });
        worker.on('error', function (e) {
            console.log(error(e));
            process.nextTick(function () {
                process.exit(-1);
            });
        });
        worker.on('exit', function (code) {
            console.log(notice("Worker exited with code: %d", code));
        });
        worker.on('message', function (data) {
            if (data.error) {
                console.error(error(err));
            } else {
                console.log(notice(data.msg));
            }
            process.exit(0);
        });
        worker.send({
            cmd: 'startServer',
            params: [fullpath, options.domain, options.port, options.cluster]
        });
        worker.unref();
    }

    var sock = sockFile();
    fs.exists(sock, function (exists) {
        debug(error(sock, exists));
        if (exists) {
            var client = new nssocket.NsSocket();
            client.on('start', function () {
                client.send(['host', 'add'], JSON.stringify([fullpath, options]));
            }).on('error', function (e) {
                debug(error(e));
                if (e.code == 'ECONNREFUSED') {
                    fs.unlink(sock, createWorker);
                } else {
                    console.error(error(e));
                    process.exit(1);
                }
            });
            client.data(['host', 'status'], function (data) {
                var err = JSON.parse(data)[0];
                var msg = JSON.parse(data)[1];
                if (err) {
                    console.error(error(err));
                } else {
                    console.log(notice(msg));
                }
                process.exit(0);
            });
            client.connect(sock);
        } else {
            createWorker();
        }
    });
};
