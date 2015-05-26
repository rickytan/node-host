/*
 * To change this license header, choose License Headers in Project Properties.
 * To change this template file, choose Tools | Templates
 * and open the template in the editor.
 */
var host0 = require('./test/host0')
  , host1 = require('./test/host1')
  , app0 = require('../LevelEditor');

var http = require('http')
  , url = require('url');
  
  
http.createServer(function (req, res) {
    var host = req.headers.host.split(':')[0];
    console.log(req);
    if ("host0.mydomain.com" == host) {
        host0(req, res);
    } else if ("host1.mydomain.com" == host) {
        host1(req, res);
    } else {
        app0(req, res);
    }
}).listen(8080, "");
