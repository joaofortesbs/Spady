process.env.HOSTNAME = process.env.BIND_HOST || '0.0.0.0';
process.env.PORT ||= '3000';

require('./server.js');