var path = require('path');

exports = module.exports = function (execPath) {
    this.appPath = execPath;
    this.fullPath = path.join(process.cwd(), execPath);
    this.handler = require(this.fullPath);
    if (typeof this.handler !== 'function') {
        throw new Error("Not a valid app! the main entry must export a function with signuture function(req, res)");
    }
};