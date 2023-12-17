'use strict';

const { Device } = require('homey');
const modbus = require('jsmodbus');
const net = require('net');
const decodeData = require('../../lib/decodeData.js');
const socket = new net.Socket();
let i=0;



class MennekesModbusStorageDevice extends Device {
	/*constructor?*/
    async onInit() {
        let self = this;
        // Register device triggers
        self._changedOperationalStatus = self.homey.flow.getDeviceTriggerCard('changedOperationalStatus');
        self._changedBattery = self.homey.flow.getDeviceTriggerCard('changedBattery');
        self._changedBatteryCharging = self.homey.flow.getDeviceTriggerCard('changedBatteryCharging');
        self._changedPowerDrawn = self.homey.flow.getDeviceTriggerCard('changedPowerDrawn');
 //       self._changedBatteryCapacity = self.homey.flow.getDeviceTriggerCard('changedBatteryCapacity');
        self._changedCurrent = self.homey.flow.getDeviceTriggerCard('changedCurrent');
		self._changedCurrentLimit = self.homey.flow.getDeviceTriggerCard('changedCurrentLimit');
		//self._changedConnected = self.homey.flow.getDeviceTriggerCard('changedConnected');
		self._changedYield = self.homey.flow.getDeviceTriggerCard('changedYield');
        this._registerFlows();
		this.setupCapabilityListeners();
		
        let options = {
            'host': self.getSetting('address'),
            'port': self.getSetting('port'),
            'unitId': 1,
            'timeout': 5000,
            'autoReconnect': true,
            'reconnectTimeout': self.getSetting('polling'),
            'logLabel': 'Mennekes Amtron',
            'logLevel': 'error',
            'logEnabled': false
        }

        let client = new modbus.client.TCP(socket, 3)
        socket.connect(options);

        socket.on('connect', () => {
            self.log('Connected ...');

			self.pollingInterval_fast = self.homey.setInterval(() => {
                Promise.all([
                    client.readHoldingRegisters(212, 2),	/*charger operational code*/
				]).then((results) => {
						let current_L1		 = decodeData.decodeU32(		results[0].response._body._valuesAsArray, 0, 0) /1000.0	;	//Current in L1 (A)
						self.log("current_L1_fastpolling "+current_L1);
				}).catch((err) => {
						self.log(err);
					})
            }, 500);
        
			
			
            self.pollingInterval = self.homey.setInterval(() => {
                Promise.all([
                    client.readHoldingRegisters(104, 1),	/*charger operational code*/
                    client.readHoldingRegisters(705, 1),	/*Battery charged during session in Wh*/
                    client.readHoldingRegisters(1000, 1),	/*current limit*/
                    client.readHoldingRegisters(741, 6),	/*EV ID*/
                    client.readHoldingRegisters(709, 1),	/*Charge duration in seconds*/
					client.readHoldingRegisters(716, 2),	/*EV_charged energy (wh)*/
					client.readHoldingRegisters(134, 1),	/*EV_Max_Current (mA)*/
					client.readHoldingRegisters(122, 1),	/*EV_state Control Pilot vehi-cle state in deci-mal format*/
					client.readHoldingRegisters(200, 28) 	/*AC measurements, read complete page*/                

                ]).then((results) => {
					//client.writeSingleRegister(1000,32);
					
                    let operational_code = 								results[0].response._body._valuesAsArray[0]				;	/*charger operational code*/	
					self.log("operational code " + operational_code	);
					
                    let battery 		 = 								results[1].response._body._valuesAsArray[0] / 1000.0	;	/*Charged Energy in kWh*/                  
					self.log("Session charged energt " + battery	);
					
                    let current_limit 	 = 								results[2].response._body._valuesAsArray[0]				;	//current limit in A
					self.log("current_limit " + current_limit	);
					
                    let EV_ID 			 = decodeData.decodeHexString(	results[3].response._body._valuesAsArray )				;		/*EV ID, to HEX string*/
					self.log("EV_ID: "+EV_ID);
					
					let session_duration = 								results[4].response._body._valuesAsArray[0]		/60	;		//minutes
					self.log("Session duration "+ session_duration);
					
					let EV_charged		 = decodeData.decodeU32(		results[5].response._body._valuesAsArray, 0, 0)	/1000		;//session charged energy (kWh)
					self.log("EV_charged energy "+EV_charged);
					
					let EV_curent_max	 = decodeData.decodeU32(		results[6].response._body._valuesAsArray, 0, 0)			;	
					self.log("EV_curent_max "+EV_curent_max);
					
					let EV_control_state = 								results[7].response._body._valuesAsArray[0]				;	//EV needs to support this
					self.log("EV_control_state "+EV_control_state);
			
					let power_L1		 = decodeData.decodeU32(		results[8].response._body._valuesAsArray.slice(6,8), 0, 0)	/1000	;//Power in L1 (kWh)
					self.log("power_L1 "+power_L1);
					
					let power_L2		 = decodeData.decodeU32(		results[8].response._body._valuesAsArray.slice(8,10), 0, 0)	/1000		;
					//self.log("power_L2 "+power_L2);
					
					let power_L3		 = decodeData.decodeU32(		results[8].response._body._valuesAsArray.slice(10,12), 0, 0)/1000			;
					//self.log("power_L3 "+power_L3);
					
					let current_L1		 = decodeData.decodeU32(		results[8].response._body._valuesAsArray.slice(12,14), 0, 0) /1000.0	;	//Current in L1 (A)
					self.log("current_L1 "+current_L1);
					
					let current_L2		 = decodeData.decodeU32(		results[8].response._body._valuesAsArray.slice(14,16), 0, 0) /1000.0	;
					//self.log("current_L2 "+current_L2);
					
					let current_L3		 = decodeData.decodeU32(		results[8].response._body._valuesAsArray.slice(16,18), 0, 0) /1000.0	;
					//self.log("current_L3 "+current_L3);
					
					let tot_yield		 = decodeData.decodeU32(		results[8].response._body._valuesAsArray.slice(18,20), 0, 0) / 1000.0	;//Total energy in kWh
					self.log("tot_yield "+tot_yield);
					
					let tot_power		 = decodeData.decodeU32(		results[8].response._body._valuesAsArray.slice(20,22), 0, 0) /1000.0	;//Total charging energy in kW
					self.log("tot_power "+tot_power);
                    let ac_volt_L1		 = decodeData.decodeU32(		results[8].response._body._valuesAsArray.slice(22,24), 0, 0)			;//AC L1 voltage in Volt
					
					self.log("ac_volt_L1 "+ac_volt_L1);
					
                    let ac_volt_L2		 = decodeData.decodeU32(		results[8].response._body._valuesAsArray.slice(24,26), 0, 0)			;
					let ac_volt_L3		 = decodeData.decodeU32(		results[8].response._body._valuesAsArray.slice(26,28), 0, 0)			;

					let charge 			 = decodeData.decodeU32(		results[2].response._body._valuesAsArray, 0, 0		) /1000.0			;//Actual AC charge limit current
					
					
					 
					
					let power_drawn 	 = 0;
					let battery_capacity = 0;
					let powergrid_feed_in = 0;
					let discharge = 0;		
					
					
					/*Cant discharge*/
                    //31397, Battery charge, Wh (U64, FIX0)
                    //31401, Battery discharge, Wh (U64, FIX0)

                    // OPERATIONAL STATUS
					let state= '';
					switch(operational_code){						
						case 0 : state = 'Available';		break;					
						case 1 : state = 'Occupied';		break;
						case 2 : state = 'Reserved';		break;													
						case 3 : state = 'Unavailable';		break;							
						case 4 : state = 'Faulted';			break;														
						case 5 : state = 'Preparing';		break;		
						case 6 : state = 'Charging';		break;	
						case 7 : state = 'Suspended';		break;	
						case 8 : state = 'Suspended';		break;								
						case 9 : state = 'Finishing';		break;	
						default: state= 'Unknown';						
					}	
					
					self.log( "operation_status: "+ self.homey.__(state) );
                    if (self.getCapabilityValue('operational_status') != self.homey.__(state) ) {				
                        self.setCapabilityValue('operational_status', self.homey.__(state) )
                            .then(function () {

                                let tokens = {
                                    status: self.homey.__(state)
                                }
                                self._changedOperationalStatus.trigger(self, tokens, {}).catch(error => { self.error(error) });

                            }).catch(reason => {
                                self.error(reason);
                            });

                    }
					

                    // BATTERY, session charged
                    if (self.getCapabilityValue('battery') != battery) {
                        self.setCapabilityValue('battery', battery)
                            .then(function () {

                                let tokens = {
                                    charge: battery
                                }
                                self._changedBattery.trigger(self, tokens, {}).catch(error => { self.error(error) });

                            }).catch(reason => {
                                self.error(reason);
                            });
                    }
					
					
                    // MEASURE_POWER: MOMENTAL CHARGING POWER
                    if (self.getCapabilityValue('measure_power.charge') != tot_power) {
                        self.setCapabilityValue('measure_power.charge', tot_power)
                            .then(function () {

                                let tokens = {
                                    charging: tot_power
                                }
                                self._changedBatteryCharging.trigger(self, tokens, {}).catch(error => { self.error(error) });

                            }).catch(reason => {
                                self.error(reason);
                            });
                    }

 /*                  // MEASURE_POWER: DISCHARGE
                    if (self.getCapabilityValue('measure_yield') != tot_yield) {
                        self.setCapabilityValue('measure_yield', tot_yield)
                            .then(function () {

                                let tokens = {
                                    yield: tot_yield
                                }
                                self._changedBatteryDischarging.trigger(self, tokens, {}).catch(error => { self.error(error) });

                            }).catch(reason => {
                                self.error(reason);
                            });
                    }
*/

                    // POWER DRAWN
                    if (self.getCapabilityValue('power_drawn') != tot_power) {
                        self.setCapabilityValue('power_drawn', tot_power)
                            .then(function () {

                                let tokens = {
                                    drawn: tot_power
                                }
                                self._changedPowerDrawn.trigger(self, tokens, {}).catch(error => { self.error(error) });

                            }).catch(reason => {
                                self.error(reason);
                            });
                    }

 /*                 
                    // BATTERY CAPACITY, Energy required: NOT ALWAYS AVAILABLE!?
/*                    if (self.getCapabilityValue('battery_capacity') != EV_Required) {
                        self.setCapabilityValue('battery_capacity', EV_Required)
                            .then(function () {

                                let tokens = {
                                    capacity: EV_Required
                                }
                                self._changedBatteryCapacity.trigger(self, tokens, {}).catch(error => { self.error(error) });

                            }).catch(reason => {
                                self.error(reason);
                            });
                    }
	*/				
					
					 // current L1
                    if (self.getCapabilityValue('charge_current') != current_L1) {
                        self.setCapabilityValue('charge_current', current_L1)
                            .then(function () {

                                let tokens = {
                                    current: current_L1
                                }
                                self._changedCurrent.trigger(self, tokens, {}).catch(error => { self.error(error) });

                            }).catch(reason => {
                                self.error(reason);
                            });
                    }
					
					 // current limit
                    if (self.getCapabilityValue('charge_limit') != current_limit) {
                        self.setCapabilityValue('charge_limit', current_limit)
                            .then(function () {

                                let tokens = {
                                    current: current_limit
                                }
                                self._changedCurrent.trigger(self, tokens, {}).catch(error => { self.error(error) });

                            }).catch(reason => {
                                self.error(reason);
                            });
                    }

					 // current limit
                    if (self.getCapabilityValue('measure_yield') != tot_yield) {
                        self.setCapabilityValue('measure_yield', tot_yield)
                            .then(function () {

                                let tokens = {
                                    yield: tot_yield
                                }
                                self._changedYield.trigger(self, tokens, {}).catch(error => { self.error(error) });

                            }).catch(reason => {
                                self.error(reason);
                            });
                    }

                }).catch((err) => {
                    self.log(err);
                })
            }, self.getSetting('polling') * 1000);
        });

        socket.on('error', (err) => {
            self.log(err);
            socket.end();
        })

        socket.on('close', () => {
            self.log('Client closed, retrying in 5 seconds');
			self.homey.clearInterval(self.pollingInterval_fast);
            self.homey.clearInterval(self.pollingInterval);
            self.homey.setTimeout(() => {
                socket.connect(options);
                self.log('Reconnecting now ...');
            }, 5000)
        })

    }
	
	async setupCapabilityListeners() {
		
     /*   this.registerCapabilityListener('changedCurrent', async (current) => {
            this.log(`Set active current limit to '${current}'`);
            // Adjust active power to be <= max power
            const activeCurrent = current;
            await this.setMaxActiveCurrentOutput(activeCurrent)
                .catch(reason => {
                    let msg = `Failed to set active power limit! Reason: ${reason.message}`;
                    this.error(msg);
                    return Promise.reject(new Error(msg));
                });
        });
	*/
    }
	
	setMaxActiveCurrentOutput(current) {
		
		current = Math.min(32, current);
		current = Math.max( 6, current);
		
		this.log("Write max current @device.js "+current);
		return self.client.writeSingleRegister(1000,current)
		  .then((result) => {
			  return Promise.resolve(true);
		  }).catch(reason => {
        return Promise.reject(reason);
      });
	}

	  _registerFlows() {
        this.log('Registering Mennekes flows with args ');

		const set_target_current = this.homey.flow.getActionCard('set_target_current');
        set_target_current.registerRunListener(async (args) => {
            this.log(`Action 'set_target_current' triggered with values: `+args.current );
			
            // Adjust active power to be <= max power			
            const activeCurrent = args.current;
            return self.setMaxActiveCurrentOutput(activeCurrent)
                .then(function (result) {
                    return Promise.resolve(true);
                }).catch(reason => {					
                    return Promise.reject(`Failed to set the active current output. Reason: ${reason.message}`);
                });
        });
	
	}
}

module.exports = MennekesModbusStorageDevice;
