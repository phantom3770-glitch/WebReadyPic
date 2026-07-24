const handler = require('./generate-seo');

module.exports = async function(req, res) {
  return handler(req, res);
};
