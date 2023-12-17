"use strict";

const { App } = require('homey');
const { Log } = require('homey-log');

class MennekesModbusApp extends App {

  async onInit() {
    this.homeyLog = new Log({ homey: this.homey });
    this.log('Initializing Mennekes Modbus app ...');
  }
}

module.exports = MennekesModbusApp;
