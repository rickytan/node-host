

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

exports = module.exports = Server;