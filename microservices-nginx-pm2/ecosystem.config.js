/**
 * PM2 Ecosystem Config
 *
 * user-service    — cluster mode, 2 instances (zero-downtime reload)
 * product-service — cluster mode, 2 instances
 * order-service   — fork mode,    1 instance
 *
 * Usage:
 *   pm2 start ecosystem.config.js          # start all
 *   pm2 reload ecosystem.config.js         # zero-downtime reload (cluster)
 *   pm2 stop   ecosystem.config.js         # stop all
 *   pm2 delete ecosystem.config.js         # remove all
 */

module.exports = {
  apps: [
    {
      name:               'user-service',
      script:             './microservices/user-service/index.js',
      cwd:                '/home/ubuntu/microservices',
      instances:          2,
      exec_mode:          'cluster',
      watch:              false,
      max_memory_restart: '200M',
      restart_delay:      1000,
      max_restarts:       10,
      env: {
        NODE_ENV: 'production',
        PORT:     3001,
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file:      '/var/log/pm2/user-service-error.log',
      out_file:        '/var/log/pm2/user-service-out.log',
      merge_logs:      true,
    },

    {
      name:               'product-service',
      script:             './microservices/product-service/index.js',
      cwd:                '/home/ubuntu/microservices',
      instances:          2,
      exec_mode:          'cluster',
      watch:              false,
      max_memory_restart: '200M',
      restart_delay:      1000,
      max_restarts:       10,
      env: {
        NODE_ENV: 'production',
        PORT:     3002,
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file:      '/var/log/pm2/product-service-error.log',
      out_file:        '/var/log/pm2/product-service-out.log',
      merge_logs:      true,
    },

    {
      name:               'order-service',
      script:             './microservices/order-service/index.js',
      cwd:                '/home/ubuntu/microservices',
      instances:          1,
      exec_mode:          'fork',
      watch:              false,
      max_memory_restart: '200M',
      restart_delay:      1000,
      max_restarts:       10,
      env: {
        NODE_ENV:             'production',
        PORT:                 3003,
        PRODUCT_SERVICE_URL:  'http://localhost:3002',
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file:      '/var/log/pm2/order-service-error.log',
      out_file:        '/var/log/pm2/order-service-out.log',
      merge_logs:      true,
    },
  ],
};
